"""
=============================================================================
AEGIS INTELLIGENCE HEAD  v1.0
Multi-Modal Forensic Fusion Network  (MMFFN)
=============================================================================
Architecture:
  ┌──────────────────────────────────────────────────────────┐
  │  Vision Branch (4 parallel CNNs)                         │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
  │  │ Identity │ │  Salary  │ │   ITR    │ │  Land    │   │
  │  │  CNN     │ │  CNN     │ │  CNN     │ │  CNN     │   │
  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
  │       └────────────┴────────────┴─────────────┘         │
  │                       CONCAT                             │
  │                         │                               │
  │              Visual Fusion Dense (256)                   │
  └────────────────────────┬─────────────────────────────────┘
                           │
  ┌────────────────────────┼─────────────────────────────────┐
  │  Logic Branch (FNN)    │                                  │
  │  Metadata Vector ──► Dense(64) ──► Dense(32)             │
  └────────────────────────┬─────────────────────────────────┘
                           │
                    LATE FUSION CONCAT
                           │
                    Dense(128) ─► Dropout(0.4)
                    Dense(64)  ─► Dropout(0.3)
                    Dense(1, sigmoid)
                           │
                     RISK SCORE (0–1)

Usage:
    python train_aegis_model.py --dataset ./dataset --epochs 30 --batch 16
=============================================================================
"""

import os
import json
import argparse
import warnings
import logging
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import seaborn as sns
from pathlib import Path
from datetime import datetime
from collections import defaultdict

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
warnings.filterwarnings("ignore")
logging.getLogger("tensorflow").setLevel(logging.ERROR)

# ---- tensorflow ---------------------------------------------------------
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, Model, Input, callbacks
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.regularizers import l2

# ---- image / pdf --------------------------------------------------------
from PIL import Image
from pdf2image import convert_from_path

# ---- scikit-learn -------------------------------------------------------
from sklearn.model_selection import train_test_split
from sklearn.preprocessing   import StandardScaler
from sklearn.metrics         import (
    classification_report, confusion_matrix,
    roc_curve, auc, precision_recall_curve
)

# =========================================================================
#  CONFIGURATION
# =========================================================================

IMG_SIZE      = 128          # px (per-side, square crop of first page)
IMG_CHANNELS  = 3
N_META_FEATS  = 12           # dimension of tabular metadata vector
PDF_TYPES     = ["identity", "salary", "itr", "land_record"]
RANDOM_SEED   = 42
np.random.seed(RANDOM_SEED)
tf.random.set_seed(RANDOM_SEED)

# =========================================================================
#  1. DATA LOADER
# =========================================================================

def pdf_to_image(pdf_path: str, size: int = IMG_SIZE) -> np.ndarray:
    """
    Convert first page of a PDF to a normalised RGB numpy array [0,1].
    Falls back to a blank image if conversion fails (robustness).
    """
    try:
        pages = convert_from_path(pdf_path, dpi=72, first_page=1, last_page=1)
        img   = pages[0].convert("RGB").resize((size, size), Image.LANCZOS)
        return np.array(img, dtype=np.float32) / 255.0
    except Exception as e:
        print(f"  [WARN] Could not render {pdf_path}: {e}")
        return np.zeros((size, size, IMG_CHANNELS), dtype=np.float32)


def extract_meta_features(manifest: dict) -> np.ndarray:
    """
    Extract a fixed-length numeric feature vector from manifest.json.
    This is the 'Logical Intelligence' branch input.

    Features:
      [0]  salary_gross (normalised)
      [1]  salary_net
      [2]  itr_total_income
      [3]  land_value
      [4]  net/gross ratio (logic check)
      [5]  income/salary ratio (cross-doc consistency)
      [6]  land_value / salary_gross (wealth ratio)
      [7]  is_gross_plausible (1 if gross > 0)
      [8]  producer_flag  (1 = Adobe/Photoshop, 0 = CoreSystem)
      [9]  fraud_flag_count
      [10] math_mismatch flag (binary)
      [11] semantic_drift flag (binary)
    """
    sg  = float(manifest.get("salary_gross", 0))
    sn  = float(manifest.get("salary_net",   0))
    ii  = float(manifest.get("itr_total_income", 0))
    lv  = float(manifest.get("land_value",   0))

    net_gross_ratio     = sn  / sg  if sg  > 0 else 0.0
    income_sal_ratio    = ii  / (sg * 12) if sg > 0 else 0.0
    wealth_ratio        = lv  / sg  if sg  > 0 else 0.0
    is_gross_plausible  = 1.0 if sg > 5000 else 0.0

    producer = manifest.get("pdf_producer", "").lower()
    producer_flag = 1.0 if any(k in producer for k in
                                ["photoshop", "illustrator", "acrobat", "gimp"]) else 0.0

    flags       = manifest.get("fraud_flags", [])
    flag_count  = float(len(flags))
    math_flag   = 1.0 if "math_mismatch"  in flags else 0.0
    drift_flag  = 1.0 if "semantic_drift" in flags else 0.0

    raw = np.array([
        sg, sn, ii, lv,
        net_gross_ratio, income_sal_ratio, wealth_ratio,
        is_gross_plausible, producer_flag,
        flag_count, math_flag, drift_flag,
    ], dtype=np.float32)

    return raw


def load_dataset(dataset_dir: str, verbose: bool = True):
    """
    Walk dataset/safe/ and dataset/risked/, load 4 PDFs + manifest per
    applicant, and return:
      images_dict  : {pdf_type: np.ndarray shape (N, H, W, C)}
      meta_matrix  : np.ndarray shape (N, N_META_FEATS)
      labels       : np.ndarray shape (N,)   0=safe, 1=risked
      paths        : list of folder paths (for debugging)
    """
    base = Path(dataset_dir)
    if not base.exists():
        raise FileNotFoundError(f"Dataset directory not found: {base}")

    raw_images  = defaultdict(list)
    raw_meta    = []
    raw_labels  = []
    raw_paths   = []

    for cls, label in [("safe", 0), ("risked", 1)]:
        cls_dir = base / cls
        if not cls_dir.exists():
            print(f"  [WARN] Class directory missing: {cls_dir}")
            continue

        applicant_folders = sorted(cls_dir.iterdir())
        n_total = len(applicant_folders)
        if verbose:
            print(f"\n  Loading [{cls.upper()}] — {n_total} applicants ...")

        for i, folder in enumerate(applicant_folders):
            if not folder.is_dir():
                continue

            manifest_path = folder / "manifest.json"
            if not manifest_path.exists():
                continue

            with open(manifest_path) as f:
                manifest = json.load(f)

            # ---- load 4 PDFs ----------------------------------------
            ok = True
            for pdf_type in PDF_TYPES:
                pdf_path = folder / f"{pdf_type}.pdf"
                if not pdf_path.exists():
                    print(f"  [WARN] Missing {pdf_type}.pdf in {folder}")
                    ok = False
                    break
                img = pdf_to_image(str(pdf_path))
                raw_images[pdf_type].append(img)

            if not ok:
                # Pop partial entries
                for pdf_type in PDF_TYPES:
                    if raw_images[pdf_type]:
                        raw_images[pdf_type].pop()
                continue

            # ---- metadata + label -----------------------------------
            raw_meta.append(extract_meta_features(manifest))
            raw_labels.append(label)
            raw_paths.append(str(folder))

            if verbose and (i + 1) % 50 == 0:
                print(f"    {i+1}/{n_total} loaded ...")

    if not raw_labels:
        raise ValueError("No valid samples found! Check dataset path & structure.")

    # Stack to numpy arrays
    images_dict = {
        pt: np.stack(raw_images[pt], axis=0)
        for pt in PDF_TYPES
    }
    meta_matrix = np.stack(raw_meta,   axis=0)
    labels      = np.array(raw_labels, dtype=np.float32)

    if verbose:
        print(f"\n  Dataset loaded:")
        print(f"    Total samples  : {len(labels)}")
        print(f"    Safe  (0)      : {int(np.sum(labels == 0))}")
        print(f"    Risked (1)     : {int(np.sum(labels == 1))}")
        print(f"    Image shape    : {images_dict[PDF_TYPES[0]].shape}")
        print(f"    Meta shape     : {meta_matrix.shape}")

    return images_dict, meta_matrix, labels, raw_paths


# =========================================================================
#  2. MODEL ARCHITECTURE
# =========================================================================

def build_cnn_branch(name: str, img_size: int = IMG_SIZE,
                     channels: int = IMG_CHANNELS) -> tuple:
    """
    Lightweight CNN branch for one document type.
    Returns (Input tensor, feature vector tensor).

    Architecture per branch:
      Conv2D(32,3) → BN → MaxPool
      Conv2D(64,3) → BN → MaxPool
      Conv2D(128,3) → BN → MaxPool
      GlobalAvgPool → Dense(64)
    """
    inp = Input(shape=(img_size, img_size, channels), name=f"input_{name}")

    x = layers.Conv2D(32, (3, 3), padding="same", activation="relu",
                      kernel_regularizer=l2(1e-4), name=f"{name}_conv1")(inp)
    x = layers.BatchNormalization(name=f"{name}_bn1")(x)
    x = layers.MaxPooling2D((2, 2), name=f"{name}_pool1")(x)

    x = layers.Conv2D(64, (3, 3), padding="same", activation="relu",
                      kernel_regularizer=l2(1e-4), name=f"{name}_conv2")(x)
    x = layers.BatchNormalization(name=f"{name}_bn2")(x)
    x = layers.MaxPooling2D((2, 2), name=f"{name}_pool2")(x)

    x = layers.Conv2D(128, (3, 3), padding="same", activation="relu",
                      kernel_regularizer=l2(1e-4), name=f"{name}_conv3")(x)
    x = layers.BatchNormalization(name=f"{name}_bn3")(x)
    x = layers.MaxPooling2D((2, 2), name=f"{name}_pool3")(x)

    x = layers.Conv2D(128, (3, 3), padding="same", activation="relu",
                      name=f"{name}_conv4")(x)
    x = layers.GlobalAveragePooling2D(name=f"{name}_gap")(x)
    x = layers.Dense(64, activation="relu", name=f"{name}_dense")(x)
    x = layers.Dropout(0.25, name=f"{name}_drop")(x)

    return inp, x


def build_meta_branch(n_features: int = N_META_FEATS) -> tuple:
    """
    FNN branch for tabular metadata (Logical Intelligence).
    Returns (Input tensor, feature vector tensor).
    """
    inp = Input(shape=(n_features,), name="input_meta")

    x = layers.Dense(64, activation="relu",
                     kernel_regularizer=l2(1e-4), name="meta_dense1")(inp)
    x = layers.BatchNormalization(name="meta_bn1")(x)
    x = layers.Dropout(0.3, name="meta_drop1")(x)

    x = layers.Dense(32, activation="relu",
                     kernel_regularizer=l2(1e-4), name="meta_dense2")(x)
    x = layers.BatchNormalization(name="meta_bn2")(x)
    x = layers.Dropout(0.2, name="meta_drop2")(x)

    return inp, x


def build_aegis_model(img_size: int = IMG_SIZE,
                      n_meta: int = N_META_FEATS,
                      learning_rate: float = 1e-4) -> Model:
    """
    Build the full Multi-Modal Forensic Fusion Network (MMFFN).

    Vision Branch: 4 parallel CNNs (one per document type)
    Logic Branch : FNN on metadata vector
    Fusion       : Late fusion concat → Dense → sigmoid
    """
    # ---- 4 CNN branches (one per doc type) --------------------------
    cnn_inputs  = []
    cnn_outputs = []
    for pdf_type in PDF_TYPES:
        inp, feat = build_cnn_branch(pdf_type, img_size)
        cnn_inputs.append(inp)
        cnn_outputs.append(feat)

    # ---- Concatenate all 4 visual outputs ---------------------------
    if len(cnn_outputs) > 1:
        visual_concat = layers.Concatenate(name="visual_concat")(cnn_outputs)
    else:
        visual_concat = cnn_outputs[0]

    visual_feat = layers.Dense(256, activation="relu",
                               name="visual_fusion")(visual_concat)
    visual_feat = layers.BatchNormalization(name="visual_bn")(visual_feat)
    visual_feat = layers.Dropout(0.35, name="visual_drop")(visual_feat)

    # ---- FNN logic branch -------------------------------------------
    meta_input, meta_feat = build_meta_branch(n_meta)

    # ---- Late Fusion ------------------------------------------------
    fused = layers.Concatenate(name="late_fusion")([visual_feat, meta_feat])

    x = layers.Dense(128, activation="relu",
                     kernel_regularizer=l2(1e-4), name="fusion_dense1")(fused)
    x = layers.BatchNormalization(name="fusion_bn1")(x)
    x = layers.Dropout(0.40, name="fusion_drop1")(x)

    x = layers.Dense(64, activation="relu",
                     kernel_regularizer=l2(1e-4), name="fusion_dense2")(x)
    x = layers.BatchNormalization(name="fusion_bn2")(x)
    x = layers.Dropout(0.30, name="fusion_drop2")(x)

    # ---- Output: fraud risk score -----------------------------------
    output = layers.Dense(1, activation="sigmoid", name="risk_score")(x)

    # ---- Assemble ---------------------------------------------------
    all_inputs = cnn_inputs + [meta_input]
    model = Model(inputs=all_inputs, outputs=output, name="AEGIS_MMFFN_v1")

    model.compile(
        optimizer=Adam(learning_rate=learning_rate, clipnorm=1.0),
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
#  3.  DATA AUGMENTATION (on-the-fly, images only)
# =========================================================================

def augment_images(images_dict: dict, labels: np.ndarray,
                   augment_factor: int = 2) -> tuple:
    """
    Apply mild augmentations to training images:
      - Random horizontal flip
      - Random brightness ±15%
      - Random contrast ±15%
    Doubles (or triples) the dataset size.
    """
    aug_images = defaultdict(list)
    aug_labels = []

    for i in range(len(labels)):
        # Keep original
        for pt in PDF_TYPES:
            aug_images[pt].append(images_dict[pt][i])
        aug_labels.append(labels[i])

        # Add augmented copies
        for _ in range(augment_factor - 1):
            for pt in PDF_TYPES:
                img = images_dict[pt][i].copy()
                # Random flip
                if np.random.random() > 0.5:
                    img = img[:, ::-1, :]
                # Random brightness
                delta = np.random.uniform(-0.15, 0.15)
                img   = np.clip(img + delta, 0.0, 1.0)
                # Random contrast
                factor = np.random.uniform(0.85, 1.15)
                mean   = img.mean(axis=(0, 1), keepdims=True)
                img    = np.clip((img - mean) * factor + mean, 0.0, 1.0)
                aug_images[pt].append(img.astype(np.float32))
            aug_labels.append(labels[i])

    result_images = {pt: np.stack(aug_images[pt], axis=0) for pt in PDF_TYPES}
    result_labels = np.array(aug_labels, dtype=np.float32)
    return result_images, result_labels


# =========================================================================
#  4.  TRAINING PIPELINE
# =========================================================================

def prepare_inputs(images_dict: dict, meta_matrix: np.ndarray) -> list:
    """Package model inputs in the order expected by build_aegis_model."""
    return [images_dict[pt] for pt in PDF_TYPES] + [meta_matrix]


def train_model(dataset_dir: str, epochs: int = 30, batch_size: int = 16,
                output_dir: str = ".", augment: bool = True,
                val_split: float = 0.20, verbose: int = 1):
    """
    Full training pipeline:
      1. Load data
      2. Scale metadata
      3. Train/val split
      4. (Optional) augment training data
      5. Build and train model with callbacks
      6. Evaluate and save artefacts
    """
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    run_ts  = datetime.now().strftime("%Y%m%d_%H%M%S")

    print("\n" + "="*65)
    print("  AEGIS INTELLIGENCE HEAD — Training Pipeline v1.0")
    print("="*65)

    # ---- Load ----------------------------------------------------------
    images_dict, meta_matrix, labels, paths = load_dataset(dataset_dir, verbose=True)
    N = len(labels)

    if N < 4:
        raise ValueError(f"Need at least 4 samples to train; got {N}.")

    # ---- Scale metadata (fit on all data, re-split after) -----------
    scaler = StandardScaler()
    meta_scaled = scaler.fit_transform(meta_matrix).astype(np.float32)

    # ---- Train / Val / Test split 70/15/15 -------------------------
    idx = np.arange(N)
    idx_tv, idx_test = train_test_split(idx, test_size=0.15,
                                        stratify=labels, random_state=RANDOM_SEED)
    idx_train, idx_val = train_test_split(
        idx_tv, test_size=val_split / (1 - 0.15),
        stratify=labels[idx_tv], random_state=RANDOM_SEED
    )

    def subset(images_d, meta, lbl, idx_arr):
        imgs = {pt: images_d[pt][idx_arr] for pt in PDF_TYPES}
        return imgs, meta[idx_arr], lbl[idx_arr]

    train_imgs, train_meta, train_lbl = subset(images_dict, meta_scaled, labels, idx_train)
    val_imgs,   val_meta,   val_lbl   = subset(images_dict, meta_scaled, labels, idx_val)
    test_imgs,  test_meta,  test_lbl  = subset(images_dict, meta_scaled, labels, idx_test)

    print(f"\n  Split:  Train={len(train_lbl)}  Val={len(val_lbl)}  Test={len(test_lbl)}")

    # ---- Augment training set --------------------------------------
    if augment and len(train_lbl) < 500:
        factor = max(2, min(5, 200 // max(len(train_lbl), 1)))
        print(f"\n  Augmenting training data (factor={factor}) ...")
        train_imgs, aug_lbl = augment_images(train_imgs, train_lbl, factor)
        # meta: repeat to match augmented labels
        train_meta = np.tile(train_meta, (factor, 1))[:len(aug_lbl)]
        train_lbl  = aug_lbl
        print(f"  Augmented train set: {len(train_lbl)} samples")

    # ---- Build model -----------------------------------------------
    print("\n  Building AEGIS Multi-Modal Forensic Fusion Network ...")
    model = build_aegis_model()
    model.summary(line_length=80, print_fn=lambda s: print("  " + s))

    total_params = model.count_params()
    print(f"\n  Total parameters: {total_params:,}")

    # ---- Callbacks -------------------------------------------------
    ckpt_path = str(out_dir / "aegis_model_v1.keras")
    cb_list   = [
        callbacks.ModelCheckpoint(
            filepath=ckpt_path,
            monitor="val_auc",
            mode="max",
            save_best_only=True,
            verbose=1,
        ),
        callbacks.EarlyStopping(
            monitor="val_auc",
            patience=8,
            mode="max",
            restore_best_weights=True,
            verbose=1,
        ),
        callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=4,
            min_lr=1e-6,
            verbose=1,
        ),
        callbacks.CSVLogger(str(out_dir / f"training_log_{run_ts}.csv")),
    ]

    # ---- Class weights (handle imbalance) -------------------------
    n_safe   = int(np.sum(train_lbl == 0))
    n_risked = int(np.sum(train_lbl == 1))
    total_t  = n_safe + n_risked
    cw = {
        0: total_t / (2 * max(n_safe, 1)),
        1: total_t / (2 * max(n_risked, 1)),
    }
    print(f"\n  Class weights: safe={cw[0]:.3f}  risked={cw[1]:.3f}")

    # ---- Train -------------------------------------------------------
    train_inputs = prepare_inputs(train_imgs, train_meta)
    val_inputs   = prepare_inputs(val_imgs,   val_meta)

    print(f"\n  Training for up to {epochs} epochs (batch={batch_size}) ...\n")
    history = model.fit(
        x=train_inputs,
        y=train_lbl,
        validation_data=(val_inputs, val_lbl),
        epochs=epochs,
        batch_size=batch_size,
        class_weight=cw,
        callbacks=cb_list,
        verbose=verbose,
    )

    # ---- Evaluation ------------------------------------------------
    print("\n" + "="*65)
    print("  EVALUATION ON HELD-OUT TEST SET")
    print("="*65)

    test_inputs = prepare_inputs(test_imgs, test_meta)
    test_loss, test_acc, test_auc, test_prec, test_rec = model.evaluate(
        test_inputs, test_lbl, verbose=0
    )
    f1 = (2 * test_prec * test_rec / max(test_prec + test_rec, 1e-8))

    print(f"\n  Test Accuracy  : {test_acc:.4f}  ({test_acc*100:.2f}%)")
    print(f"  Test AUC-ROC   : {test_auc:.4f}")
    print(f"  Test Precision : {test_prec:.4f}")
    print(f"  Test Recall    : {test_rec:.4f}")
    print(f"  Test F1 Score  : {f1:.4f}")
    print(f"  Test Loss      : {test_loss:.4f}")

    # Classification report
    y_pred_prob = model.predict(test_inputs, verbose=0).flatten()
    y_pred      = (y_pred_prob >= 0.5).astype(int)
    print("\n  Classification Report:")
    print(classification_report(test_lbl.astype(int), y_pred,
                                 target_names=["Safe (0)", "Risked (1)"],
                                 digits=4))

    # ---- Save scaler & results -------------------------------------
    import pickle
    with open(out_dir / "meta_scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)

    results = {
        "run_timestamp": run_ts,
        "test_accuracy":  round(float(test_acc),  4),
        "test_auc_roc":   round(float(test_auc),  4),
        "test_precision": round(float(test_prec), 4),
        "test_recall":    round(float(test_rec),  4),
        "test_f1":        round(float(f1),        4),
        "test_loss":      round(float(test_loss), 4),
        "total_params":   total_params,
        "epochs_trained": len(history.history["loss"]),
        "best_checkpoint": ckpt_path,
    }
    with open(out_dir / f"eval_results_{run_ts}.json", "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n  Best model saved: {ckpt_path}")
    print(f"  Scaler saved    : {out_dir / 'meta_scaler.pkl'}")

    # ---- Generate plots -------------------------------------------
    print("\n  Generating diagnostic plots ...")
    plot_all_diagnostics(history, test_lbl, y_pred_prob, y_pred,
                         out_dir, run_ts)

    print("\n" + "="*65)
    print("  Training pipeline complete.")
    print("="*65 + "\n")

    return model, history, results


# =========================================================================
#  5.  VISUALISATIONS
# =========================================================================

PALETTE = {
    "blue":   "#003F87",
    "gold":   "#B8860B",
    "red":    "#C0392B",
    "green":  "#1A8A4A",
    "grey":   "#555555",
    "bg":     "#FAFAFA",
    "light":  "#E8F0F8",
}

def _style_ax(ax, title="", xlabel="", ylabel=""):
    ax.set_facecolor(PALETTE["bg"])
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#CCCCCC")
    ax.spines["bottom"].set_color("#CCCCCC")
    ax.tick_params(colors=PALETTE["grey"], labelsize=9)
    if title:   ax.set_title(title, fontsize=11, fontweight="bold",
                              color=PALETTE["blue"], pad=8)
    if xlabel:  ax.set_xlabel(xlabel, fontsize=9, color=PALETTE["grey"])
    if ylabel:  ax.set_ylabel(ylabel, fontsize=9, color=PALETTE["grey"])


def plot_all_diagnostics(history, y_true, y_pred_prob, y_pred,
                         out_dir: Path, run_ts: str):
    """
    Produce a single comprehensive A3-style diagnostic report figure:
      Row 1: Training Accuracy | Training Loss | AUC curve history
      Row 2: ROC Curve | Precision-Recall | Confusion Matrix
    """
    fig = plt.figure(figsize=(20, 12), facecolor="white")
    fig.suptitle(
        "AEGIS Multi-Modal Forensic Fusion Network – Training Diagnostics",
        fontsize=16, fontweight="bold", color=PALETTE["blue"], y=0.98
    )

    gs = gridspec.GridSpec(2, 3, figure=fig, hspace=0.42, wspace=0.38)
    ep = range(1, len(history.history["loss"]) + 1)

    # ----------------------------------------------------------------
    # 1. Training & Validation Accuracy
    # ----------------------------------------------------------------
    ax1 = fig.add_subplot(gs[0, 0])
    ax1.plot(ep, history.history["accuracy"],
             color=PALETTE["blue"], lw=2.2, label="Train Accuracy")
    ax1.plot(ep, history.history["val_accuracy"],
             color=PALETTE["gold"], lw=2.2, linestyle="--", label="Val Accuracy")
    ax1.fill_between(ep, history.history["accuracy"],
                     history.history["val_accuracy"],
                     alpha=0.08, color=PALETTE["blue"])
    ax1.legend(fontsize=8, framealpha=0.7)
    _style_ax(ax1, "Model Accuracy", "Epoch", "Accuracy")
    ax1.set_ylim(0, 1.05)
    best_val = max(history.history["val_accuracy"])
    ax1.axhline(best_val, color=PALETTE["red"], lw=0.8, linestyle=":")
    ax1.text(1, best_val + 0.01, f"Best: {best_val:.3f}",
             color=PALETTE["red"], fontsize=8)

    # ----------------------------------------------------------------
    # 2. Training & Validation Loss
    # ----------------------------------------------------------------
    ax2 = fig.add_subplot(gs[0, 1])
    ax2.plot(ep, history.history["loss"],
             color=PALETTE["red"], lw=2.2, label="Train Loss")
    ax2.plot(ep, history.history["val_loss"],
             color=PALETTE["grey"], lw=2.2, linestyle="--", label="Val Loss")
    ax2.fill_between(ep, history.history["loss"],
                     history.history["val_loss"],
                     alpha=0.08, color=PALETTE["red"])
    ax2.legend(fontsize=8, framealpha=0.7)
    _style_ax(ax2, "Binary Cross-Entropy Loss", "Epoch", "Loss")
    best_vl = min(history.history["val_loss"])
    ax2.axhline(best_vl, color=PALETTE["green"], lw=0.8, linestyle=":")
    ax2.text(1, best_vl + 0.01, f"Best: {best_vl:.3f}",
             color=PALETTE["green"], fontsize=8)

    # ----------------------------------------------------------------
    # 3. AUC history
    # ----------------------------------------------------------------
    ax3 = fig.add_subplot(gs[0, 2])
    if "auc" in history.history:
        ax3.plot(ep, history.history["auc"],
                 color=PALETTE["blue"], lw=2.2, label="Train AUC")
        ax3.plot(ep, history.history["val_auc"],
                 color=PALETTE["gold"], lw=2.2, linestyle="--", label="Val AUC")
        ax3.legend(fontsize=8, framealpha=0.7)
        ax3.set_ylim(0, 1.05)
    _style_ax(ax3, "AUC-ROC History", "Epoch", "AUC")

    # ----------------------------------------------------------------
    # 4. ROC Curve
    # ----------------------------------------------------------------
    ax4 = fig.add_subplot(gs[1, 0])
    if len(np.unique(y_true)) > 1:
        fpr, tpr, _ = roc_curve(y_true, y_pred_prob)
        roc_auc     = auc(fpr, tpr)
        ax4.plot(fpr, tpr, color=PALETTE["blue"], lw=2.5,
                 label=f"ROC (AUC = {roc_auc:.4f})")
        ax4.fill_between(fpr, tpr, alpha=0.10, color=PALETTE["blue"])
        ax4.plot([0, 1], [0, 1], color="#BBBBBB", lw=1.2, linestyle="--",
                 label="Random (AUC = 0.50)")
        ax4.legend(fontsize=8, framealpha=0.7)
    _style_ax(ax4, "ROC Curve (Test Set)", "False Positive Rate", "True Positive Rate")
    ax4.set_xlim([-0.02, 1.02])
    ax4.set_ylim([-0.02, 1.05])

    # ----------------------------------------------------------------
    # 5. Precision-Recall Curve
    # ----------------------------------------------------------------
    ax5 = fig.add_subplot(gs[1, 1])
    if len(np.unique(y_true)) > 1:
        prec_c, rec_c, _ = precision_recall_curve(y_true, y_pred_prob)
        pr_auc = auc(rec_c, prec_c)
        ax5.plot(rec_c, prec_c, color=PALETTE["gold"], lw=2.5,
                 label=f"PR (AUC = {pr_auc:.4f})")
        ax5.fill_between(rec_c, prec_c, alpha=0.10, color=PALETTE["gold"])
        baseline = np.mean(y_true)
        ax5.axhline(baseline, color="#BBBBBB", lw=1.2, linestyle="--",
                    label=f"Baseline = {baseline:.2f}")
        ax5.legend(fontsize=8, framealpha=0.7)
    _style_ax(ax5, "Precision-Recall Curve", "Recall", "Precision")
    ax5.set_xlim([-0.02, 1.02])
    ax5.set_ylim([-0.02, 1.05])

    # ----------------------------------------------------------------
    # 6. Confusion Matrix
    # ----------------------------------------------------------------
    ax6 = fig.add_subplot(gs[1, 2])
    if len(np.unique(y_true)) > 1:
        cm = confusion_matrix(y_true.astype(int), y_pred)
        sns.heatmap(
            cm, annot=True, fmt="d", cmap="Blues",
            xticklabels=["Safe (0)", "Risked (1)"],
            yticklabels=["Safe (0)", "Risked (1)"],
            ax=ax6, linewidths=0.5, linecolor="#CCCCCC",
            annot_kws={"size": 13, "weight": "bold"},
        )
    _style_ax(ax6, "Confusion Matrix (Test Set)", "Predicted", "Actual")
    ax6.tick_params(axis="x", rotation=0)

    # ---- Watermark --------------------------------------------------
    fig.text(0.5, 0.01,
             "AEGIS MMFFN v1.0 — Canara Bank Fraud Detection Research   |   "
             f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}   |   "
             "STRICTLY CONFIDENTIAL",
             ha="center", fontsize=7, color="#AAAAAA", style="italic")

    # ---- Save -------------------------------------------------------
    plot_path = out_dir / f"aegis_training_diagnostics_{run_ts}.png"
    fig.savefig(str(plot_path), dpi=180, bbox_inches="tight",
                facecolor="white", edgecolor="none")
    plt.close(fig)
    print(f"  Diagnostics plot saved: {plot_path}")

    # ---- Second figure: prediction distribution --------------------
    _plot_score_distribution(y_true, y_pred_prob, out_dir, run_ts)


def _plot_score_distribution(y_true, y_pred_prob, out_dir, run_ts):
    """Histogram of fraud risk scores by class."""
    fig, ax = plt.subplots(figsize=(10, 5), facecolor="white")
    ax.set_facecolor(PALETTE["bg"])

    bins = np.linspace(0, 1, 40)
    safe_scores   = y_pred_prob[y_true == 0]
    risked_scores = y_pred_prob[y_true == 1]

    ax.hist(safe_scores,   bins=bins, color=PALETTE["green"], alpha=0.65,
            label=f"Safe   (n={len(safe_scores)})",   density=True, edgecolor="white")
    ax.hist(risked_scores, bins=bins, color=PALETTE["red"],   alpha=0.65,
            label=f"Risked (n={len(risked_scores)})", density=True, edgecolor="white")

    ax.axvline(0.5, color=PALETTE["blue"], lw=2.0, linestyle="--",
               label="Decision Threshold = 0.50")

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.set_title(
        "AEGIS Risk Score Distribution by Class",
        fontsize=13, fontweight="bold", color=PALETTE["blue"], pad=10
    )
    ax.set_xlabel("Fraud Risk Score  (0 = Safe → 1 = Fraudulent)",
                  fontsize=10, color=PALETTE["grey"])
    ax.set_ylabel("Density", fontsize=10, color=PALETTE["grey"])
    ax.legend(fontsize=9, framealpha=0.7)

    fig.text(0.5, 0.01,
             "AEGIS MMFFN v1.0 — Score Distribution   |   STRICTLY CONFIDENTIAL",
             ha="center", fontsize=7, color="#AAAAAA", style="italic")

    plot_path = out_dir / f"aegis_score_distribution_{run_ts}.png"
    fig.savefig(str(plot_path), dpi=180, bbox_inches="tight",
                facecolor="white", edgecolor="none")
    plt.close(fig)
    print(f"  Score distribution plot saved: {plot_path}")


# =========================================================================
#  6.  INFERENCE UTILITY
# =========================================================================

def predict_dossier(model_path: str, scaler_path: str,
                    dossier_dir: str) -> dict:
    """
    Run inference on a single applicant dossier folder.
    Returns a dict with risk_score, verdict, and feature breakdown.
    """
    import pickle
    from tensorflow.keras.models import load_model

    dossier = Path(dossier_dir)
    model   = load_model(model_path)
    with open(scaler_path, "rb") as f:
        scaler = pickle.load(f)

    imgs = []
    for pt in PDF_TYPES:
        pdf_path = dossier / f"{pt}.pdf"
        img      = pdf_to_image(str(pdf_path))
        imgs.append(img[np.newaxis, ...])          # (1, H, W, C)

    manifest_path = dossier / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)

    raw_meta    = extract_meta_features(manifest)
    scaled_meta = scaler.transform(raw_meta[np.newaxis, :])

    inputs       = imgs + [scaled_meta]
    risk_score   = float(model.predict(inputs, verbose=0)[0][0])
    verdict      = "RISKED (FRAUDULENT)" if risk_score >= 0.5 else "SAFE (GENUINE)"

    return {
        "applicant_id": manifest.get("applicant_id", "unknown"),
        "risk_score":   round(risk_score, 6),
        "verdict":      verdict,
        "confidence":   round(abs(risk_score - 0.5) * 2, 4),
        "meta_features": {
            "salary_gross":   manifest.get("salary_gross"),
            "salary_net":     manifest.get("salary_net"),
            "itr_income":     manifest.get("itr_total_income"),
            "land_value":     manifest.get("land_value"),
            "pdf_producer":   manifest.get("pdf_producer"),
            "fraud_flags":    manifest.get("fraud_flags", []),
        },
    }


# =========================================================================
#  7.  CLI ENTRY POINT
# =========================================================================

def parse_args():
    p = argparse.ArgumentParser(
        description="Train the AEGIS Multi-Modal Forensic Fusion Network",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--dataset",   default="./dataset",
                   help="Root dataset directory (must contain safe/ and risked/)")
    p.add_argument("--epochs",    type=int,   default=30,
                   help="Maximum training epochs")
    p.add_argument("--batch",     type=int,   default=16,
                   help="Training batch size")
    p.add_argument("--lr",        type=float, default=1e-4,
                   help="Initial learning rate")
    p.add_argument("--output",    default="./aegis_output",
                   help="Directory to save model, logs, and plots")
    p.add_argument("--no-augment",action="store_true",
                   help="Disable training data augmentation")
    p.add_argument("--predict",   default=None,
                   help="Path to a dossier folder to run inference (skip training)")
    p.add_argument("--model",     default=None,
                   help="Path to saved model for --predict mode")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()

    if args.predict:
        # ---- Inference mode -----------------------------------------
        model_path  = args.model or f"{args.output}/aegis_model_v1.keras"
        scaler_path = f"{args.output}/meta_scaler.pkl"
        print(f"\n  Running inference on: {args.predict}")
        result = predict_dossier(model_path, scaler_path, args.predict)
        print(f"\n  ── AEGIS VERDICT ──────────────────────────────────")
        print(f"  Applicant ID  : {result['applicant_id']}")
        print(f"  Risk Score    : {result['risk_score']:.6f}")
        print(f"  Verdict       : {result['verdict']}")
        print(f"  Confidence    : {result['confidence']*100:.1f}%")
        print(f"  PDF Producer  : {result['meta_features']['pdf_producer']}")
        print(f"  Fraud Flags   : {result['meta_features']['fraud_flags']}")
        print(f"  ───────────────────────────────────────────────────\n")

    else:
        # ---- Training mode ------------------------------------------
        model, history, results = train_model(
            dataset_dir=args.dataset,
            epochs=args.epochs,
            batch_size=args.batch,
            output_dir=args.output,
            augment=not args.no_augment,
            verbose=1,
        )

        print("\n  Final Metrics Summary:")
        for k, v in results.items():
            if isinstance(v, float):
                print(f"    {k:<22}: {v:.4f}")
            else:
                print(f"    {k:<22}: {v}")
