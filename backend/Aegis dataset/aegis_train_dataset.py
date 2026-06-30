"""
=============================================================================
AEGIS INTELLIGENCE HEAD  v2.0  —  Logic Stream Trainer
=============================================================================
Trains the tabular Fraud-Detection FNN on 12 computed features extracted
from each applicant's manifest.json and salary PDF image (ELA).

Architecture:
    Input (12,)
    ├── Dense(64, relu) → BatchNorm → Dropout(0.30)
    ├── Dense(32, relu) → BatchNorm → Dropout(0.20)
    └── Dense(16, relu) → Dense(1, sigmoid)  →  risk_score

Feature vector (N_META_FEATS = 12) — zero leakage:
  [0]  salary_gross         raw value from manifest
  [1]  salary_net           raw value
  [2]  itr_total_income     raw value
  [3]  land_value           raw value
  [4]  net_gross_ratio      net / gross
  [5]  income_sal_ratio     itr / (gross × 12)
  [6]  wealth_ratio         land / gross
  [7]  is_gross_plausible   1 if gross > 5000
  [8]  producer_flag        1 if PDF producer looks like image editor
  [9]  net_gross_anomaly    1 if net/gross outside [0.40, 0.95]
  [10] income_sal_anomaly   1 if itr/(gross×12) outside [0.60, 2.50]
  [11] ela_sal_score        ELA normalised score on salary PDF image

Usage:
    python aegis_train_dataset.py
    python aegis_train_dataset.py --epochs 40 --batch 32 --output ./aegis_output
=============================================================================
"""

import os
import io
import json
import pickle
import argparse
import warnings
import logging
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from datetime import datetime
from collections import defaultdict

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
warnings.filterwarnings("ignore")
logging.getLogger("tensorflow").setLevel(logging.ERROR)

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, Model, Input, callbacks
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.regularizers import l2

from PIL import Image
try:
    import fitz as pymupdf
    _USE_FITZ = True
except ImportError:
    from pdf2image import convert_from_path
    _USE_FITZ = False

from sklearn.model_selection import train_test_split
from sklearn.preprocessing   import StandardScaler
from sklearn.metrics         import (
    classification_report, confusion_matrix,
    roc_auc_score, precision_recall_curve, roc_curve, auc,
)

# =========================================================================
#  CONFIGURATION
# =========================================================================

N_META_FEATS = 12
RANDOM_SEED  = 42
IMG_SIZE     = 128          # only used for ELA computation on salary PDF

np.random.seed(RANDOM_SEED)
tf.random.set_seed(RANDOM_SEED)


# =========================================================================
#  1.  FEATURE EXTRACTION
# =========================================================================

def _pdf_to_image(pdf_path: str, size: int = IMG_SIZE) -> np.ndarray:
    """Render first page of a PDF → normalised float32 RGB array [0,1]."""
    try:
        if _USE_FITZ:
            doc  = pymupdf.open(pdf_path)
            page = doc[0]
            pix  = page.get_pixmap(dpi=72)
            img  = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            doc.close()
        else:
            pages = convert_from_path(pdf_path, dpi=72, first_page=1, last_page=1)
            img   = pages[0].convert("RGB")
        img = img.resize((size, size), Image.LANCZOS)
        return np.array(img, dtype=np.float32) / 255.0
    except Exception:
        return np.zeros((size, size, 3), dtype=np.float32)


def compute_ela_score(img_array: np.ndarray, quality: int = 75) -> float:
    """
    Error Level Analysis on a [0,1] float32 RGB numpy array.
    High score = more compression artefacts = evidence of prior editing.
    Returns a normalised score in [0, 1].
    """
    try:
        pil_img     = Image.fromarray((img_array * 255).astype(np.uint8), "RGB")
        buf         = io.BytesIO()
        pil_img.save(buf, format="JPEG", quality=quality)
        buf.seek(0)
        recompressed = Image.open(buf).convert("RGB")
        diff         = np.abs(
            np.array(pil_img, dtype=np.float32) -
            np.array(recompressed, dtype=np.float32)
        )
        return float(np.clip(diff.mean() / 30.0, 0.0, 1.0))
    except Exception:
        return 0.0


def extract_meta_features(manifest: dict,
                           ela_sal_score: float = 0.0) -> np.ndarray:
    """
    Build the 12-dimensional leak-free feature vector from a manifest dict.

    IMPORTANT — none of these features read fraud_flags, math_mismatch, or
    semantic_drift from the manifest.  All signals are computable from the
    raw documents at inference time.
    """
    sg  = float(manifest.get("salary_gross",      0))
    sn  = float(manifest.get("salary_net",        0))
    ii  = float(manifest.get("itr_total_income",  0))
    lv  = float(manifest.get("land_value",        0))

    net_gross_ratio  = sn / sg       if sg > 0 else 0.0
    income_sal_ratio = ii / (sg * 12) if sg > 0 else 0.0
    wealth_ratio     = lv / sg        if sg > 0 else 0.0
    is_gross_plausible = 1.0 if sg > 5_000 else 0.0

    producer = manifest.get("pdf_producer", "").lower()
    producer_flag = 1.0 if any(
        k in producer for k in ["photoshop", "illustrator", "acrobat", "gimp", "canva"]
    ) else 0.0

    # Rule-based anomaly signals
    net_gross_anomaly  = 0.0
    if sg > 0:
        r = net_gross_ratio
        net_gross_anomaly = 1.0 if (r < 0.40 or r > 0.95) else 0.0

    income_sal_anomaly = 0.0
    if sg > 0 and ii > 0:
        r = income_sal_ratio
        income_sal_anomaly = 1.0 if (r < 0.60 or r > 2.50) else 0.0

    return np.array([
        sg, sn, ii, lv,
        net_gross_ratio, income_sal_ratio, wealth_ratio,
        is_gross_plausible, producer_flag,
        net_gross_anomaly, income_sal_anomaly,
        float(ela_sal_score),
    ], dtype=np.float32)


# =========================================================================
#  2.  DATASET LOADER
# =========================================================================

def load_dataset(dataset_dir: str, verbose: bool = True):
    """
    Walk dataset/safe/ and dataset/risked/, read manifest.json + compute
    ELA on salary.pdf, and return:

        meta_matrix : np.ndarray  (N, N_META_FEATS)
        labels      : np.ndarray  (N,)   0=safe  1=risked

    Images are NOT stored — this is a tabular-only FNN.
    """
    base = Path(dataset_dir)
    if not base.exists():
        raise FileNotFoundError(f"Dataset dir not found: {base}")

    raw_meta   = []
    raw_labels = []
    skipped    = 0

    for cls, label in [("safe", 0), ("risked", 1)]:
        cls_dir = base / cls
        if not cls_dir.exists():
            if verbose:
                print(f"  [WARN] Missing class dir: {cls_dir}")
            continue

        folders = sorted([f for f in cls_dir.iterdir() if f.is_dir()])
        if verbose:
            print(f"\n  Loading [{cls.upper()}] — {len(folders)} applicants ...")

        for i, folder in enumerate(folders):
            manifest_path = folder / "manifest.json"
            if not manifest_path.exists():
                skipped += 1
                continue

            with open(manifest_path) as f:
                manifest = json.load(f)

            # Compute ELA on salary PDF image (feature [11])
            sal_path = folder / "salary.pdf"
            ela_sal  = 0.0
            if sal_path.exists():
                img_arr = _pdf_to_image(str(sal_path))
                ela_sal = compute_ela_score(img_arr)

            raw_meta.append(extract_meta_features(manifest, ela_sal_score=ela_sal))
            raw_labels.append(float(label))

            if verbose and (i + 1) % 100 == 0:
                print(f"    {i+1}/{len(folders)} loaded ...")

    if not raw_labels:
        raise ValueError("No valid samples found!  Check dataset path & structure.")

    meta_matrix = np.stack(raw_meta, axis=0)
    labels      = np.array(raw_labels, dtype=np.float32)

    if verbose:
        n_safe   = int(np.sum(labels == 0))
        n_risked = int(np.sum(labels == 1))
        print(f"\n  Dataset loaded:")
        print(f"    Total   : {len(labels)}")
        print(f"    Safe    : {n_safe}")
        print(f"    Risked  : {n_risked}")
        if skipped:
            print(f"    Skipped : {skipped} (missing manifest)")

    return meta_matrix, labels


# =========================================================================
#  3.  MODEL ARCHITECTURE  —  Tabular FNN (Logic Stream)
# =========================================================================

def build_logic_fnn(n_features: int = N_META_FEATS,
                    learning_rate: float = 1e-3) -> Model:
    """
    Fraud-detection FNN for tabular metadata (the Logic Intelligence stream).

    Deliberately kept small:  ~8K parameters.  This ensures it cannot
    overfit a 2000-sample dataset and gives interpretable weights.

      Dense(64, relu) → BN → Dropout(0.30)
      Dense(32, relu) → BN → Dropout(0.20)
      Dense(16, relu)
      Dense(1,  sigmoid)
    """
    inp = Input(shape=(n_features,), name="meta_input")

    x = layers.Dense(64, activation="relu",
                     kernel_regularizer=l2(1e-4), name="dense1")(inp)
    x = layers.BatchNormalization(name="bn1")(x)
    x = layers.Dropout(0.30, name="drop1")(x)

    x = layers.Dense(32, activation="relu",
                     kernel_regularizer=l2(1e-4), name="dense2")(x)
    x = layers.BatchNormalization(name="bn2")(x)
    x = layers.Dropout(0.20, name="drop2")(x)

    x = layers.Dense(16, activation="relu",
                     kernel_regularizer=l2(1e-4), name="dense3")(x)

    out = layers.Dense(1, activation="sigmoid", name="risk_score")(x)

    model = Model(inputs=inp, outputs=out, name="AEGIS_LogicFNN_v2")
    model.compile(
        optimizer=Adam(learning_rate=learning_rate),
        loss="binary_crossentropy",
        metrics=[
            "accuracy",
            keras.metrics.AUC(name="auc"),
            keras.metrics.Precision(name="precision"),
            keras.metrics.Recall(name="recall"),
        ],
    )
    return model


# =========================================================================
#  4.  TRAINING PIPELINE
# =========================================================================

def train_model(dataset_dir: str,
                epochs:      int   = 40,
                batch_size:  int   = 32,
                output_dir:  str   = "./aegis_output",
                val_split:   float = 0.15,
                verbose:     int   = 1):
    """
    Full training pipeline:
      1. Load tabular dataset
      2. Normalise features (StandardScaler)
      3. 70 / 15 / 15 stratified split
      4. Train Logic FNN
      5. Evaluate & save artefacts
    """
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    run_ts  = datetime.now().strftime("%Y%m%d_%H%M%S")

    print("\n" + "=" * 65)
    print("  AEGIS LOGIC STREAM  —  Training Pipeline v2.0")
    print("=" * 65)

    # ---- Load -----------------------------------------------------------
    meta_matrix, labels = load_dataset(dataset_dir, verbose=True)
    N = len(labels)
    if N < 8:
        raise ValueError(f"Need at least 8 samples to train; got {N}.")

    # ---- Scale ----------------------------------------------------------
    scaler     = StandardScaler()
    meta_scaled = scaler.fit_transform(meta_matrix).astype(np.float32)

    # ---- 70 / 15 / 15 split ---------------------------------------------
    idx = np.arange(N)
    idx_tv, idx_test = train_test_split(idx, test_size=0.15,
                                        stratify=labels, random_state=RANDOM_SEED)
    idx_train, idx_val = train_test_split(
        idx_tv, test_size=val_split / (1 - 0.15),
        stratify=labels[idx_tv], random_state=RANDOM_SEED,
    )

    X_train, y_train = meta_scaled[idx_train], labels[idx_train]
    X_val,   y_val   = meta_scaled[idx_val],   labels[idx_val]
    X_test,  y_test  = meta_scaled[idx_test],  labels[idx_test]

    print(f"\n  Split:  Train={len(y_train)}  Val={len(y_val)}  Test={len(y_test)}")

    # ---- Class weights --------------------------------------------------
    n_safe   = int(np.sum(y_train == 0))
    n_risked = int(np.sum(y_train == 1))
    total_t  = n_safe + n_risked
    cw = {
        0: total_t / (2 * max(n_safe,   1)),
        1: total_t / (2 * max(n_risked, 1)),
    }
    print(f"  Class weights: safe={cw[0]:.3f}  risked={cw[1]:.3f}")

    # ---- Model ----------------------------------------------------------
    ckpt_path = str(out_dir / "aegis_model_v1.keras")
    model     = build_logic_fnn()

    if verbose:
        model.summary(line_length=70, print_fn=lambda s: print("  " + s))
        print(f"\n  Parameters: {model.count_params():,}")

    cb_list = [
        callbacks.ModelCheckpoint(
            filepath=ckpt_path, monitor="val_auc", mode="max",
            save_best_only=True, verbose=1,
        ),
        callbacks.EarlyStopping(
            monitor="val_auc", patience=10, mode="max",
            restore_best_weights=True, verbose=1,
        ),
        callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=5,
            min_lr=1e-6, verbose=1,
        ),
        callbacks.CSVLogger(str(out_dir / f"training_log_{run_ts}.csv")),
    ]

    print(f"\n  Training for up to {epochs} epochs (batch={batch_size}) ...\n")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=epochs,
        batch_size=batch_size,
        class_weight=cw,
        callbacks=cb_list,
        verbose=verbose,
    )

    # ---- Evaluate -------------------------------------------------------
    print("\n" + "=" * 65)
    print("  EVALUATION ON HELD-OUT TEST SET")
    print("=" * 65)

    test_loss, test_acc, test_auc, test_prec, test_rec = model.evaluate(
        X_test, y_test, verbose=0
    )
    f1 = 2 * test_prec * test_rec / max(test_prec + test_rec, 1e-8)

    print(f"\n  Test Accuracy  : {test_acc:.4f}  ({test_acc * 100:.2f}%)")
    print(f"  Test AUC-ROC   : {test_auc:.4f}")
    print(f"  Test Precision : {test_prec:.4f}")
    print(f"  Test Recall    : {test_rec:.4f}")
    print(f"  Test F1 Score  : {f1:.4f}")
    print(f"  Test Loss      : {test_loss:.4f}")

    y_pred_prob = model.predict(X_test, verbose=0).flatten()
    y_pred      = (y_pred_prob >= 0.5).astype(int)
    print("\n  Classification Report:")
    print(classification_report(y_test.astype(int), y_pred,
                                 target_names=["Safe (0)", "Risked (1)"],
                                 digits=4))

    # ---- Save artefacts -------------------------------------------------
    with open(out_dir / "meta_scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)
    print(f"\n  [SUCCESS] Scaler saved  -> {out_dir / 'meta_scaler.pkl'}")
    print(f"  [SUCCESS] Best model    -> {ckpt_path}")

    results = {
        "run_timestamp":  run_ts,
        "n_train":        int(len(y_train)),
        "n_val":          int(len(y_val)),
        "n_test":         int(len(y_test)),
        "test_accuracy":  round(float(test_acc),  4),
        "test_auc_roc":   round(float(test_auc),  4),
        "test_precision": round(float(test_prec), 4),
        "test_recall":    round(float(test_rec),  4),
        "test_f1":        round(float(f1),        4),
        "test_loss":      round(float(test_loss), 4),
        "epochs_trained": len(history.history["loss"]),
        "best_checkpoint": ckpt_path,
    }

    result_path = out_dir / f"eval_results_{run_ts}.json"
    with open(result_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"  [SUCCESS] Eval results  -> {result_path}")

    _plot_training(history, y_test, y_pred_prob, out_dir, run_ts)

    return model, history, results


# =========================================================================
#  5.  PLOTTING
# =========================================================================

def _plot_training(history, y_test, y_pred_prob, out_dir: Path, run_ts: str):
    """Save training curves and ROC curve."""
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    fig.suptitle("AEGIS Logic FNN — Training Report", fontsize=14)

    # Loss
    axes[0].plot(history.history["loss"],     label="Train Loss")
    axes[0].plot(history.history["val_loss"], label="Val Loss")
    axes[0].set_title("Loss")
    axes[0].set_xlabel("Epoch")
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)

    # AUC
    axes[1].plot(history.history["auc"],     label="Train AUC")
    axes[1].plot(history.history["val_auc"], label="Val AUC")
    axes[1].set_title("AUC-ROC")
    axes[1].set_xlabel("Epoch")
    axes[1].set_ylim(0.4, 1.05)
    axes[1].legend()
    axes[1].grid(True, alpha=0.3)

    # ROC curve on test set
    fpr, tpr, _ = roc_curve(y_test, y_pred_prob)
    auc_val      = auc(fpr, tpr)
    axes[2].plot(fpr, tpr, color="darkorange", lw=2,
                 label=f"ROC (AUC = {auc_val:.4f})")
    axes[2].plot([0, 1], [0, 1], color="navy", linestyle="--")
    axes[2].set_title("ROC Curve (Test Set)")
    axes[2].set_xlabel("False Positive Rate")
    axes[2].set_ylabel("True Positive Rate")
    axes[2].legend()
    axes[2].grid(True, alpha=0.3)

    plt.tight_layout()
    plot_path = out_dir / f"training_report_{run_ts}.png"
    plt.savefig(plot_path, dpi=120)
    plt.close()
    print(f"  [SUCCESS] Training plot -> {plot_path}")


# =========================================================================
#  6.  INFERENCE HELPER (used by predict mode)
# =========================================================================

def predict_dossier(model_path: str, scaler_path: str, folder_path: str) -> dict:
    """
    Run the logic stream on a single dossier folder.
    Expects: manifest.json, salary.pdf, identity.pdf, itr.pdf, land_record.pdf
    """
    import pickle as _pickle
    folder   = Path(folder_path)
    manifest = json.load(open(folder / "manifest.json"))

    sal_path = folder / "salary.pdf"
    ela_sal  = 0.0
    if sal_path.exists():
        img     = _pdf_to_image(str(sal_path))
        ela_sal = compute_ela_score(img)

    raw_meta = extract_meta_features(manifest, ela_sal_score=ela_sal)

    mdl    = tf.keras.models.load_model(model_path)
    scaler = _pickle.load(open(scaler_path, "rb"))

    scaled     = scaler.transform(raw_meta[np.newaxis, :])
    risk_score = float(mdl.predict(scaled, verbose=0)[0][0])
    verdict    = "RISKED (FRAUDULENT)" if risk_score >= 0.5 else "SAFE (GENUINE)"

    return {
        "applicant_id": manifest.get("applicant_id", "unknown"),
        "risk_score":   round(risk_score, 6),
        "verdict":      verdict,
        "confidence":   round(abs(risk_score - 0.5) * 2, 4),
    }


# =========================================================================
#  7.  CLI ENTRY POINT
# =========================================================================

def parse_args():
    p = argparse.ArgumentParser(
        description="Train the AEGIS Logic Stream FNN",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--dataset", default="./realistic document",
                   help="Root dataset dir (must contain safe/ and risked/)")
    p.add_argument("--epochs",  type=int,   default=40)
    p.add_argument("--batch",   type=int,   default=32)
    p.add_argument("--lr",      type=float, default=1e-3)
    p.add_argument("--output",  default="./aegis_output")
    p.add_argument("--predict", default=None,
                   help="Dossier folder path — run inference, skip training")
    p.add_argument("--model",   default=None,
                   help="Model path for --predict mode")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()

    if args.predict:
        output = args.output or "./aegis_output"
        model_path  = args.model or f"{output}/aegis_model_v1.keras"
        scaler_path = f"{output}/meta_scaler.pkl"
        print(f"\n  Running inference on: {args.predict}")
        result = predict_dossier(model_path, scaler_path, args.predict)
        print(f"\n  ── AEGIS LOGIC VERDICT ──────────────────")
        print(f"  Applicant ID : {result['applicant_id']}")
        print(f"  Risk Score   : {result['risk_score']:.6f}")
        print(f"  Verdict      : {result['verdict']}")
        print(f"  Confidence   : {result['confidence'] * 100:.1f}%")
        print(f"  ─────────────────────────────────────────\n")
    else:
        model, history, results = train_model(
            dataset_dir=args.dataset,
            epochs=args.epochs,
            batch_size=args.batch,
            output_dir=args.output,
        )
        print("\n  Final Metrics Summary:")
        for k, v in results.items():
            if isinstance(v, float):
                print(f"    {k:<22}: {v:.4f}")
            else:
                print(f"    {k:<22}: {v}")
