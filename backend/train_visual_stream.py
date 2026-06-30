"""
=============================================================================
AEGIS VISUAL STREAM TRAINER  v1.0
=============================================================================
Trains a MobileNetV2-based binary classifier on the CASIA v2 dataset to
detect pixel-level image tampering (splicing, copy-move, erasure).

The trained model generalises to bank documents because:
  - Pixel splicing artifacts are domain-independent (same compression
    seams whether the image is a photo or a scanned salary slip).
  - The CNN learns low-level noise statistics, not document semantics.

Dataset structure expected:
  backend/public_datasets/visual_stream/casia_v2/
    ├── authentic/   (7491 images, label=0)
    └── tampered/    (5123 images, label=1)

Output:
  backend/Aegis dataset/aegis_output/visual_stream_model.keras

Usage:
    python train_visual_stream.py
    python train_visual_stream.py --epochs 20 --batch 64 --img-size 224
=============================================================================
"""

import os
import sys
import argparse
import warnings
import logging
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path
from datetime import datetime

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
os.environ["PYTHONIOENCODING"]      = "utf-8"   # prevent cp1252 errors on Windows
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"       # suppress oneDNN info noise
warnings.filterwarnings("ignore")
logging.getLogger("tensorflow").setLevel(logging.ERROR)

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, callbacks
from tensorflow.keras.optimizers import Adam
from sklearn.metrics import roc_curve, auc, classification_report
from sklearn.model_selection import train_test_split

RANDOM_SEED = 42
np.random.seed(RANDOM_SEED)
tf.random.set_seed(RANDOM_SEED)

# Supported extensions for image loading
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}


# =========================================================================
#  1.  DATA PIPELINE
# =========================================================================

def scan_casia(casia_dir: str) -> tuple:
    """
    Scan the CASIA v2 directory structure and return (paths, labels).
    authentic/  → label 0
    tampered/   → label 1
    """
    base = Path(casia_dir)
    paths  = []
    labels = []

    for cls_name, label in [("authentic", 0), ("tampered", 1)]:
        cls_dir = base / cls_name
        if not cls_dir.exists():
            raise FileNotFoundError(
                f"Missing CASIA folder: {cls_dir}\n"
                f"Please place CASIA v2 images at:\n"
                f"  {cls_dir.parent}/authentic/   (Au/ contents)\n"
                f"  {cls_dir.parent}/tampered/    (Tp/ contents)"
            )
        files = [
            f for f in cls_dir.iterdir()
            if f.is_file() and f.suffix.lower() in IMAGE_EXTS
        ]
        if not files:
            raise ValueError(f"No image files found in {cls_dir}")

        paths  += [str(f) for f in files]
        labels += [label]  * len(files)

    return paths, labels


def build_tf_dataset(paths: list, labels: list,
                     img_size: int, batch_size: int,
                     augment: bool = False,
                     shuffle: bool = False) -> tf.data.Dataset:
    """Build a tf.data.Dataset that loads and preprocesses images on-the-fly."""

    def load_and_preprocess(path, label):
        def _load_pil(p):
            from PIL import Image
            try:
                with Image.open(p.numpy().decode("utf-8")) as img:
                    img = img.convert("RGB")
                    img = img.resize((img_size, img_size), Image.Resampling.BILINEAR)
                    return np.array(img, dtype=np.float32) / 255.0
            except Exception as e:
                # Fallback to zeros if image is completely unreadable
                return np.zeros((img_size, img_size, 3), dtype=np.float32)

        # tf.py_function returns a list/single tensor
        img_tensor = tf.py_function(_load_pil, [path], tf.float32)
        img_tensor.set_shape([img_size, img_size, 3])

        # Apply MobileNetV2 preprocessing (scale to [-1, 1])
        img = tf.keras.applications.mobilenet_v2.preprocess_input(img_tensor * 255.0)
        return img, tf.cast(label, tf.float32)

    def augment_fn(img, label):
        img = tf.image.random_flip_left_right(img)
        img = tf.image.random_flip_up_down(img)
        img = tf.image.random_brightness(img, max_delta=0.1)
        img = tf.image.random_contrast(img, 0.9, 1.1)
        img = tf.clip_by_value(img, -1.0, 1.0)
        return img, label

    ds = tf.data.Dataset.from_tensor_slices((paths, labels))
    if shuffle:
        ds = ds.shuffle(buffer_size=len(paths), seed=RANDOM_SEED)
    ds = ds.map(load_and_preprocess, num_parallel_calls=tf.data.AUTOTUNE)
    if augment:
        ds = ds.map(augment_fn, num_parallel_calls=tf.data.AUTOTUNE)
    ds = ds.batch(batch_size).prefetch(tf.data.AUTOTUNE)
    return ds


# =========================================================================
#  2.  MODEL ARCHITECTURE
# =========================================================================

def build_visual_model(img_size: int = 224,
                       learning_rate: float = 1e-4,
                       finetune_from: int = 100) -> keras.Model:
    """
    MobileNetV2 with ImageNet weights, fine-tuned for binary tamper detection.

    Architecture:
      MobileNetV2 (frozen backbone → unfreeze top `finetune_from` layers)
      → GlobalAveragePooling2D
      → Dense(256, relu)
      → Dropout(0.40)
      → Dense(64, relu)
      → Dropout(0.25)
      → Dense(1, sigmoid)
    """
    base = keras.applications.MobileNetV2(
        input_shape=(img_size, img_size, 3),
        include_top=False,
        weights="imagenet",
    )
    # Freeze the whole backbone initially
    base.trainable = False

    inp = keras.Input(shape=(img_size, img_size, 3), name="image_input")
    x   = base(inp, training=False)
    x   = layers.GlobalAveragePooling2D(name="gap")(x)
    x   = layers.Dense(256, activation="relu",   name="head_dense1")(x)
    x   = layers.Dropout(0.40, name="head_drop1")(x)
    x   = layers.Dense(64,  activation="relu",   name="head_dense2")(x)
    x   = layers.Dropout(0.25, name="head_drop2")(x)
    out = layers.Dense(1,   activation="sigmoid", name="tamper_score")(x)

    model = keras.Model(inputs=inp, outputs=out, name="AEGIS_VisualCNN_v1")
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
    return model, base


# =========================================================================
#  3.  TWO-PHASE TRAINING
# =========================================================================

def train_visual_stream(casia_dir:      str,
                        output_dir:     str  = "./aegis_output",
                        img_size:       int  = 224,
                        epochs_head:    int  = 10,
                        epochs_finetune:int  = 15,
                        batch_size:     int  = 32,
                        val_split:      float = 0.15,
                        test_split:     float = 0.10,
                        verbose:        int  = 1):
    """
    Two-phase training:
      Phase 1: Train head layers only (frozen backbone) for speed.
      Phase 2: Unfreeze top backbone layers, train with low LR.
    """
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    run_ts  = datetime.now().strftime("%Y%m%d_%H%M%S")

    print("\n" + "=" * 65)
    print("  AEGIS VISUAL STREAM  —  Training Pipeline v1.0")
    print("=" * 65)

    # ---- Scan dataset ---------------------------------------------------
    print(f"\n  Scanning CASIA v2 at: {casia_dir}")
    all_paths, all_labels = scan_casia(casia_dir)
    all_labels = np.array(all_labels)
    n_auth = int(np.sum(all_labels == 0))
    n_tamp = int(np.sum(all_labels == 1))
    print(f"  Found: {n_auth} authentic  +  {n_tamp} tampered  =  {len(all_labels)} total")

    # ---- Train/val/test split -------------------------------------------
    idx = np.arange(len(all_labels))
    idx_tv, idx_test = train_test_split(
        idx, test_size=test_split, stratify=all_labels, random_state=RANDOM_SEED
    )
    idx_train, idx_val = train_test_split(
        idx_tv, test_size=val_split / (1 - test_split),
        stratify=all_labels[idx_tv], random_state=RANDOM_SEED,
    )

    tr_paths  = [all_paths[i]  for i in idx_train]
    tr_labels = all_labels[idx_train].tolist()
    v_paths   = [all_paths[i]  for i in idx_val]
    v_labels  = all_labels[idx_val].tolist()
    te_paths  = [all_paths[i]  for i in idx_test]
    te_labels = all_labels[idx_test].tolist()

    print(f"  Split:  Train={len(tr_labels)}  Val={len(v_labels)}  Test={len(te_labels)}")

    # ---- Build tf.data pipelines ----------------------------------------
    train_ds = build_tf_dataset(tr_paths, tr_labels, img_size, batch_size,
                                augment=True,  shuffle=True)
    val_ds   = build_tf_dataset(v_paths,  v_labels,  img_size, batch_size,
                                augment=False, shuffle=False)
    test_ds  = build_tf_dataset(te_paths, te_labels, img_size, batch_size,
                                augment=False, shuffle=False)

    # ---- Class weights --------------------------------------------------
    n_tr_safe   = int(np.sum(np.array(tr_labels) == 0))
    n_tr_risked = int(np.sum(np.array(tr_labels) == 1))
    total_tr    = n_tr_safe + n_tr_risked
    cw = {
        0: total_tr / (2 * max(n_tr_safe,   1)),
        1: total_tr / (2 * max(n_tr_risked, 1)),
    }
    print(f"  Class weights: auth={cw[0]:.3f}  tampered={cw[1]:.3f}")

    # ---- Build model ----------------------------------------------------
    model, backbone = build_visual_model(img_size=img_size)
    if verbose:
        print(f"\n  Total parameters: {model.count_params():,}")

    ckpt_path = str(out_dir / "visual_stream_model.keras")
    base_cbs  = [
        callbacks.ModelCheckpoint(
            filepath=ckpt_path, monitor="val_auc", mode="max",
            save_best_only=True, verbose=1,
        ),
        callbacks.EarlyStopping(
            monitor="val_auc", patience=5, mode="max",
            restore_best_weights=True, verbose=1,
        ),
        callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=3,
            min_lr=1e-7, verbose=1,
        ),
        callbacks.CSVLogger(str(out_dir / f"visual_log_phase1_{run_ts}.csv")),
    ]

    # === Phase 1: head only ==============================================
    print(f"\n  -- Phase 1: Training head only ({epochs_head} epochs) --")
    h1 = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=epochs_head,
        class_weight=cw,
        callbacks=base_cbs,
        verbose=verbose,
    )

    # === Phase 2: fine-tune top 50 layers of backbone ====================
    print(f"\n  -- Phase 2: Fine-tuning backbone top-50 layers ({epochs_finetune} epochs) --")
    backbone.trainable = True
    fine_tune_at = len(backbone.layers) - 50
    for layer in backbone.layers[:fine_tune_at]:
        layer.trainable = False

    model.compile(
        optimizer=Adam(learning_rate=1e-5),   # much lower LR for fine-tune
        loss="binary_crossentropy",
        metrics=[
            "accuracy",
            keras.metrics.AUC(name="auc"),
            keras.metrics.Precision(name="precision"),
            keras.metrics.Recall(name="recall"),
        ],
    )

    cbs_p2 = [
        callbacks.ModelCheckpoint(
            filepath=ckpt_path, monitor="val_auc", mode="max",
            save_best_only=True, verbose=1,
        ),
        callbacks.EarlyStopping(
            monitor="val_auc", patience=7, mode="max",
            restore_best_weights=True, verbose=1,
        ),
        callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=3,
            min_lr=1e-8, verbose=1,
        ),
        callbacks.CSVLogger(str(out_dir / f"visual_log_phase2_{run_ts}.csv")),
    ]

    h2 = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=epochs_head + epochs_finetune,
        initial_epoch=epochs_head,
        class_weight=cw,
        callbacks=cbs_p2,
        verbose=verbose,
    )

    # ---- Evaluate -------------------------------------------------------
    print("\n" + "=" * 65)
    print("  EVALUATION ON HELD-OUT TEST SET")
    print("=" * 65)

    test_loss, test_acc, test_auc, test_prec, test_rec = model.evaluate(
        test_ds, verbose=0
    )
    f1 = 2 * test_prec * test_rec / max(test_prec + test_rec, 1e-8)

    print(f"\n  Test Accuracy  : {test_acc:.4f}  ({test_acc * 100:.2f}%)")
    print(f"  Test AUC-ROC   : {test_auc:.4f}")
    print(f"  Test Precision : {test_prec:.4f}")
    print(f"  Test Recall    : {test_rec:.4f}")
    print(f"  Test F1 Score  : {f1:.4f}")

    # Predictions for classification report & ROC curve
    y_pred_prob = model.predict(test_ds, verbose=0).flatten()
    y_pred      = (y_pred_prob >= 0.5).astype(int)
    y_true      = np.array(te_labels)
    print("\n  Classification Report:")
    print(classification_report(y_true, y_pred,
                                 target_names=["Authentic (0)", "Tampered (1)"],
                                 digits=4))

    # Save results
    import json
    results = {
        "run_timestamp":   run_ts,
        "n_train":         len(tr_labels),
        "n_val":           len(v_labels),
        "n_test":          len(te_labels),
        "img_size":        img_size,
        "test_accuracy":   round(float(test_acc),  4),
        "test_auc_roc":    round(float(test_auc),  4),
        "test_precision":  round(float(test_prec), 4),
        "test_recall":     round(float(test_rec),  4),
        "test_f1":         round(float(f1),        4),
        "best_checkpoint": ckpt_path,
    }
    result_path = out_dir / f"visual_eval_{run_ts}.json"
    with open(result_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n  [SUCCESS] Best model    -> {ckpt_path}")
    print(f"  [SUCCESS] Eval results  -> {result_path}")

    _plot_visual_training(h1, h2, y_true, y_pred_prob, out_dir, run_ts, epochs_head)
    return model, results


def _plot_visual_training(h1, h2, y_true, y_pred_prob, out_dir, run_ts, epochs_head):
    """Combine phase-1 and phase-2 histories into one plot."""
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    fig.suptitle("AEGIS Visual CNN — Training Report", fontsize=14)

    # Stitch histories
    loss_all  = h1.history["loss"]     + h2.history["loss"]
    vloss_all = h1.history["val_loss"] + h2.history["val_loss"]
    auc_all   = h1.history["auc"]      + h2.history["auc"]
    vauc_all  = h1.history["val_auc"]  + h2.history["val_auc"]
    ep        = list(range(1, len(loss_all) + 1))

    axes[0].plot(ep, loss_all,  label="Train Loss")
    axes[0].plot(ep, vloss_all, label="Val Loss")
    axes[0].axvline(epochs_head, color="gray", linestyle="--", alpha=0.5, label="Fine-tune start")
    axes[0].set_title("Loss"); axes[0].set_xlabel("Epoch")
    axes[0].legend(); axes[0].grid(True, alpha=0.3)

    axes[1].plot(ep, auc_all,  label="Train AUC")
    axes[1].plot(ep, vauc_all, label="Val AUC")
    axes[1].axvline(epochs_head, color="gray", linestyle="--", alpha=0.5, label="Fine-tune start")
    axes[1].set_title("AUC-ROC"); axes[1].set_xlabel("Epoch")
    axes[1].set_ylim(0.4, 1.05); axes[1].legend(); axes[1].grid(True, alpha=0.3)

    fpr, tpr, _ = roc_curve(y_true, y_pred_prob)
    auc_val      = auc(fpr, tpr)
    axes[2].plot(fpr, tpr, color="darkorange", lw=2,
                 label=f"ROC (AUC = {auc_val:.4f})")
    axes[2].plot([0, 1], [0, 1], color="navy", linestyle="--")
    axes[2].set_title("ROC Curve (Test Set)")
    axes[2].set_xlabel("False Positive Rate"); axes[2].set_ylabel("True Positive Rate")
    axes[2].legend(); axes[2].grid(True, alpha=0.3)

    plt.tight_layout()
    p = out_dir / f"visual_report_{run_ts}.png"
    plt.savefig(p, dpi=120); plt.close()
    print(f"  [SUCCESS] Training plot -> {p}")


# =========================================================================
#  CLI ENTRY POINT
# =========================================================================

def parse_args():
    p = argparse.ArgumentParser(
        description="Train the AEGIS Visual Stream CNN on CASIA v2",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument(
        "--casia",
        default="public_datasets/visual_stream/casia_v2",
        help="Path to the casia_v2 folder (must contain authentic/ and tampered/)",
    )
    p.add_argument("--output",           default="Aegis dataset/aegis_output")
    p.add_argument("--img-size",         type=int,   default=224)
    p.add_argument("--batch",            type=int,   default=32)
    p.add_argument("--epochs-head",      type=int,   default=10,
                   help="Epochs for head-only phase")
    p.add_argument("--epochs-finetune",  type=int,   default=15,
                   help="Additional epochs during backbone fine-tune phase")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    train_visual_stream(
        casia_dir=args.casia,
        output_dir=args.output,
        img_size=args.img_size,
        epochs_head=args.epochs_head,
        epochs_finetune=args.epochs_finetune,
        batch_size=args.batch,
    )
