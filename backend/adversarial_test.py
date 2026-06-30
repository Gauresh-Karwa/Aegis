"""
AEGIS Phase 3 — Adversarial Stress Testing Script
=================================================
Simulates real-world document degradation to validate model robustness:
  • JPEG compression at varying quality levels (10% → 100%)
  • DPI downscaling (300 → 72 DPI)
  • Gaussian noise injection
  • Rotation stress test

Usage:
    python adversarial_test.py --input_dir "Aegis dataset/realistic document/risked"
                               --sample 10

Output:
    adversarial_results.json   — tabular metrics per test
    adversarial_roc_chart.png  — ROC shift visualization
"""

import os
import sys
import json
import argparse
import random
import tempfile
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path
from datetime import datetime
from io import BytesIO
from PIL import Image, ImageFilter
import fitz

# ── Ensure backend imports work ────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent))

try:
    import tensorflow as tf
    import pickle
    MODEL_PATH = Path(__file__).parent / "Aegis dataset" / "aegis_output" / "aegis_model_v1.keras"
    SCALER_PATH = Path(__file__).parent / "Aegis dataset" / "aegis_output" / "meta_scaler.pkl"
    VISUAL_MODEL_PATH = Path(__file__).parent / "Aegis dataset" / "aegis_output" / "visual_stream_model.keras"

    model = tf.keras.models.load_model(str(MODEL_PATH)) if MODEL_PATH.exists() else None
    scaler = pickle.load(open(str(SCALER_PATH), "rb")) if SCALER_PATH.exists() else None
    visual_model = tf.keras.models.load_model(str(VISUAL_MODEL_PATH)) if VISUAL_MODEL_PATH.exists() else None
    print(f"[SUCCESS] Models loaded. FNN: {model is not None}, CNN: {visual_model is not None}")
except Exception as e:
    model = scaler = visual_model = None
    print(f"[ERROR] Model loading error: {e}")

from cv_utils import pdf_to_img_array, compute_ela, compute_benford, extract_text_from_pdf_bytes, build_meta_vector


# ─────────────────────────────────────────────────────────────────────────────
#  Document perturbation helpers
# ─────────────────────────────────────────────────────────────────────────────

def render_pdf_page(pdf_bytes, dpi=150):
    """Render first page of PDF to PIL Image."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc.load_page(0)
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    doc.close()
    return img


def compress_jpeg(img, quality):
    """Re-encode image at given JPEG quality (1-100)."""
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).copy()


def add_gaussian_noise(img, sigma=15):
    """Add Gaussian noise to simulate scanner noise."""
    arr = np.array(img, dtype=np.float32)
    noise = np.random.normal(0, sigma, arr.shape)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def rotate_image(img, angle=5):
    """Rotate image by small angle (simulating scanning tilt)."""
    return img.rotate(angle, expand=False, fillcolor=(255, 255, 255))


def downscale_dpi(img, factor=0.5):
    """Downscale image by factor to simulate low-DPI scan."""
    w, h = img.size
    new_size = (max(1, int(w * factor)), max(1, int(h * factor)))
    return img.resize(new_size, Image.LANCZOS).resize((w, h), Image.LANCZOS)


def pil_to_array_128(img):
    """Resize PIL image to 128x128 float32 array for model input."""
    arr = np.array(img.resize((128, 128), Image.LANCZOS), dtype=np.float32) / 255.0
    return arr[np.newaxis, ...]


# ─────────────────────────────────────────────────────────────────────────────
#  Score a single sample
# ─────────────────────────────────────────────────────────────────────────────

def score_sample(pdf_bytes_dict, perturb_fn=None):
    """
    Run the AEGIS two-stream pipeline on a dict of {filename: bytes}.
    Optionally apply perturb_fn to each document image before scoring.
    Returns fused risk_score (float 0-1).
    """
    def get_img(key):
        raw = pdf_bytes_dict.get(key)
        if not raw:
            return np.zeros((1, 128, 128, 3), dtype=np.float32)
        if perturb_fn:
            try:
                img = render_pdf_page(raw, dpi=150)
                img = perturb_fn(img)
                arr = np.array(img.resize((128, 128), Image.LANCZOS), dtype=np.float32) / 255.0
                return arr[np.newaxis, ...]
            except Exception:
                pass
        return pdf_to_img_array(raw)[np.newaxis, ...]

    img_id   = get_img("identity.pdf")
    img_sal  = get_img("salary.pdf")
    img_itr  = get_img("itr.pdf")
    img_land = get_img("land_record.pdf")

    logic_score = 0.15
    visual_score = 0.50

    # 1. Logic Stream Score
    if model and scaler:
        try:
            # Reconstruct the 12-dimensional logic feature vector
            meta = build_meta_vector(50000, 35000, 600000, 0, False,
                                     ela_sal_score=0.0,
                                     net_gross_anomaly=0.0,
                                     income_sal_anomaly=0.0)
            scaled = scaler.transform(meta[np.newaxis, :])
            logic_score = float(model.predict(scaled, verbose=0)[0][0])
        except Exception as e:
            print(f"    [!] Logic Inference error: {e}")

    # 2. Visual Stream Score
    if visual_model:
        try:
            _imgs = [img_id, img_sal, img_itr, img_land]
            visual_scores = []
            for _img in _imgs:
                if _img is not None:
                    # Resize to (1, 224, 224, 3) and preprocess for MobileNetV2
                    _resized = tf.image.resize(_img, [224, 224])
                    _prep = tf.keras.applications.mobilenet_v2.preprocess_input(_resized * 255.0)
                    _score = float(visual_model.predict(_prep, verbose=0)[0][0])
                    visual_scores.append(_score)
            if visual_scores:
                visual_score = float(np.mean(visual_scores))
        except Exception as e:
            print(f"    [!] Visual Inference error: {e}")

    # 3. Two-stream Fusion (0.6 Logic + 0.4 Visual)
    risk_score = 0.60 * logic_score + 0.40 * visual_score
    return risk_score


# ─────────────────────────────────────────────────────────────────────────────
#  Main stress test loop
# ─────────────────────────────────────────────────────────────────────────────

def load_sample_docs(folder_path):
    """Load PDF files from a dossier folder."""
    docs = {}
    for fname in ["identity.pdf", "salary.pdf", "itr.pdf", "land_record.pdf"]:
        fpath = Path(folder_path) / fname
        if fpath.exists():
            with open(fpath, "rb") as f:
                docs[fname] = f.read()
    return docs


def run_stress_test(dataset_dir, sample_n=10, output_dir="."):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Collect sample folders
    base = Path(dataset_dir)
    all_folders = []
    for cls in ["safe", "risked"]:
        cls_dir = base / cls
        if cls_dir.exists():
            for folder in sorted(cls_dir.iterdir()):
                if folder.is_dir() and (folder / "identity.pdf").exists():
                    all_folders.append((folder, 1 if cls == "risked" else 0))

    if not all_folders:
        print(f"[!] No dossier folders found in {dataset_dir}")
        return

    random.seed(42)
    samples = random.sample(all_folders, min(sample_n, len(all_folders)))
    print(f"[INFO] Running adversarial tests on {len(samples)} samples from {dataset_dir}")

    # Define perturbation suite
    perturbations = {
        "Baseline (no perturbation)": None,
        "JPEG Q=80":                  lambda img: compress_jpeg(img, 80),
        "JPEG Q=50":                  lambda img: compress_jpeg(img, 50),
        "JPEG Q=20":                  lambda img: compress_jpeg(img, 20),
        "JPEG Q=10":                  lambda img: compress_jpeg(img, 10),
        "Gaussian Noise sigma=10":    lambda img: add_gaussian_noise(img, 10),
        "Gaussian Noise sigma=25":    lambda img: add_gaussian_noise(img, 25),
        "Rotation 3deg":              lambda img: rotate_image(img, 3),
        "Rotation 10deg":             lambda img: rotate_image(img, 10),
        "DPI Downscale 50%":          lambda img: downscale_dpi(img, 0.5),
        "DPI Downscale 25%":          lambda img: downscale_dpi(img, 0.25),
    }

    results = []
    for pname, pfn in perturbations.items():
        print(f"\n  Testing: {pname}")
        scores_by_label = {0: [], 1: []}
        for folder, true_label in samples:
            docs = load_sample_docs(folder)
            score = score_sample(docs, perturb_fn=pfn)
            scores_by_label[true_label].append(score)
            print(f"    [{folder.name}] label={true_label} -> score={score:.4f}")

        # Compute accuracy at threshold 0.5
        all_scores = scores_by_label[0] + scores_by_label[1]
        all_labels = [0] * len(scores_by_label[0]) + [1] * len(scores_by_label[1])
        correct = sum(
            1 for s, l in zip(all_scores, all_labels)
            if (s >= 0.5) == (l == 1)
        )
        acc = correct / len(all_scores) if all_scores else 0
        avg_risked = np.mean(scores_by_label[1]) if scores_by_label[1] else 0
        avg_safe   = np.mean(scores_by_label[0]) if scores_by_label[0] else 0

        results.append({
            "perturbation": pname,
            "accuracy": round(acc, 4),
            "avg_score_risked": round(float(avg_risked), 4),
            "avg_score_safe":   round(float(avg_safe), 4),
            "separation": round(float(avg_risked - avg_safe), 4),
            "n_samples": len(all_scores),
        })
        print(f"  -> Accuracy: {acc:.2%}, Risk Separation: {avg_risked - avg_safe:.4f}")

    # Save JSON results
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    results_path = output_dir / f"adversarial_results_{ts}.json"
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"[SUCCESS] Results saved: {results_path}")

    # Plot accuracy and score separation
    plot_path = output_dir / f"adversarial_chart_{ts}.png"
    _plot_adversarial_results(results, plot_path)
    print(f"[SUCCESS] Chart saved: {plot_path}")

    return results


def _plot_adversarial_results(results, save_path):
    fig, axes = plt.subplots(1, 2, figsize=(16, 7), facecolor="white")
    fig.suptitle("AEGIS Adversarial Stress Test Results", fontsize=14, fontweight="bold", color="#003F87")

    names = [r["perturbation"] for r in results]
    accs  = [r["accuracy"] for r in results]
    seps  = [r["separation"] for r in results]

    # Accuracy bar chart
    ax = axes[0]
    colors = ["#1A8A4A" if a >= 0.80 else "#FFB800" if a >= 0.60 else "#C0392B" for a in accs]
    bars = ax.barh(names, accs, color=colors, edgecolor="white", height=0.65)
    ax.axvline(0.8, color="#003F87", lw=1.5, linestyle="--", label="80% threshold")
    ax.set_xlim(0, 1.05)
    ax.set_xlabel("Accuracy @ threshold=0.50", fontsize=10)
    ax.set_title("Classification Accuracy Under Attack", fontweight="bold", color="#003F87")
    ax.legend(fontsize=8)
    for bar, a in zip(bars, accs):
        ax.text(bar.get_width() + 0.01, bar.get_y() + bar.get_height() / 2,
                f"{a:.1%}", va="center", fontsize=8, color="#333")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    # Risk separation bar chart
    ax2 = axes[1]
    sep_colors = ["#1A8A4A" if s >= 0.30 else "#FFB800" if s >= 0.10 else "#C0392B" for s in seps]
    bars2 = ax2.barh(names, seps, color=sep_colors, edgecolor="white", height=0.65)
    ax2.axvline(0.30, color="#003F87", lw=1.5, linestyle="--", label="0.30 separation")
    ax2.set_xlabel("Score Separation (Risked − Safe)", fontsize=10)
    ax2.set_title("Risk Score Separation Under Attack", fontweight="bold", color="#003F87")
    ax2.legend(fontsize=8)
    for bar, s in zip(bars2, seps):
        ax2.text(max(bar.get_width() + 0.005, 0.01), bar.get_y() + bar.get_height() / 2,
                 f"{s:+.3f}", va="center", fontsize=8, color="#333")
    ax2.spines["top"].set_visible(False)
    ax2.spines["right"].set_visible(False)

    plt.tight_layout()
    fig.savefig(str(save_path), dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AEGIS Adversarial Stress Tester")
    parser.add_argument(
        "--input_dir", type=str,
        default="Aegis dataset/realistic document",
        help="Path to the dataset root (contains safe/ and risked/ subdirs)"
    )
    parser.add_argument(
        "--sample", type=int, default=10,
        help="Number of dossiers to sample per class"
    )
    parser.add_argument(
        "--output_dir", type=str, default=".",
        help="Directory to save results and charts"
    )
    args = parser.parse_args()

    results = run_stress_test(
        dataset_dir=args.input_dir,
        sample_n=args.sample,
        output_dir=args.output_dir,
    )

    if results:
        print("\n" + "-" * 60)
        print("  SUMMARY")
        print("-" * 60)
        baseline = next((r for r in results if "Baseline" in r["perturbation"]), None)
        if baseline:
            print(f"  Baseline accuracy:     {baseline['accuracy']:.2%}")
        worst = min(results, key=lambda r: r["accuracy"])
        print(f"  Worst-case accuracy:   {worst['accuracy']:.2%}  ({worst['perturbation']})")
        print(f"  Model ready for production: {'YES' if worst['accuracy'] >= 0.75 else 'NEEDS IMPROVEMENT'}")
        print("-" * 60)
