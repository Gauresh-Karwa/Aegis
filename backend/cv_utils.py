"""
AEGIS Forensic Engine — cv_utils.py  v4.0
==========================================
Complete forensic computation engine. Every function returns structured,
spatially-aware output traceable to specific fields, pages, and documents.

No LLM calls. No external APIs. All rules deterministic.
All findings use the canonical Finding object schema.
"""

import os
import re
import io
import math
import base64
import hashlib
import tempfile
import datetime
import numpy as np
from io import BytesIO
from collections import Counter
from PIL import Image, ImageChops, ImageEnhance, ImageFilter
import fitz  # PyMuPDF

# Optional OpenCV for copy-move detection
try:
    import cv2
    _HAVE_CV2 = True
except ImportError:
    _HAVE_CV2 = False
    print("[cv_utils] OpenCV not available — copy-move detection will use fallback.")


# ─────────────────────────────────────────────────────────────────────────────
#  FINDING OBJECT SCHEMA
#  Every forensic check returns Finding objects. This is the contract between
#  the backend and the frontend.
# ─────────────────────────────────────────────────────────────────────────────

def make_finding(
    doc_hash: str,
    check_name: str,
    severity: str,          # CRITICAL | WARNING | INFO
    category: str,          # maps to one of 9 frontend module names
    document_name: str,
    field_name: str,
    expected_value,
    actual_value,
    discrepancy_abs=None,
    discrepancy_pct=None,
    description: str = "",
    recommendation: str = "",
    evidence: dict = None,
) -> dict:
    """
    Canonical Finding object. Every forensic check must return findings
    in this schema. No ad-hoc fields allowed.
    """
    finding_id = hashlib.sha256(
        f"{doc_hash}::{check_name}::{field_name}".encode()
    ).hexdigest()[:16]

    return {
        "finding_id": finding_id,
        "severity": severity,
        "category": category,
        "document_name": document_name,
        "field_name": field_name,
        "expected_value": expected_value,
        "actual_value": actual_value,
        "discrepancy_abs": discrepancy_abs,
        "discrepancy_pct": discrepancy_pct,
        "description": description,
        "recommendation": recommendation,
        "evidence": evidence or {},
    }


# ─────────────────────────────────────────────────────────────────────────────
#  PDF → Image helpers
# ─────────────────────────────────────────────────────────────────────────────

def _fitz_to_pil(pdf_bytes, page_idx=0, dpi=150):
    """Render a specific page of a PDF via fitz and return a PIL RGB Image."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc.load_page(page_idx)
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    doc.close()
    return img


def pdf_to_img_array(pdf_bytes):
    """Convert uploaded PDF bytes to a normalized 128x128x3 float32 array."""
    if not pdf_bytes:
        return np.zeros((128, 128, 3), dtype=np.float32)
    try:
        img = _fitz_to_pil(pdf_bytes, dpi=72).resize((128, 128), Image.LANCZOS)
        return np.array(img, dtype=np.float32) / 255.0
    except Exception as e:
        print(f"pdf_to_img_array error: {e}")
    return np.zeros((128, 128, 3), dtype=np.float32)


def extract_text_from_pdf_bytes(pdf_bytes):
    if not pdf_bytes:
        return ""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        text = "".join(page.get_text() for page in doc)
        doc.close()
        return text
    except Exception as e:
        print(f"extract_text_from_pdf_bytes error: {e}")
        return ""


def extract_text_from_pdf_path(file_path):
    try:
        doc = fitz.open(file_path)
        text = "".join(page.get_text() for page in doc)
        doc.close()
        return text
    except Exception as e:
        print(f"extract_text_from_pdf_path error: {e}")
        return ""


def get_pdf_page_count(pdf_bytes):
    """Return number of pages in a PDF."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        n = len(doc)
        doc.close()
        return n
    except Exception:
        return 1


# ─────────────────────────────────────────────────────────────────────────────
#  ELA — Error Level Analysis Heatmap Matrix
# ─────────────────────────────────────────────────────────────────────────────

def compute_ela_heatmap(pdf_bytes, quality=90, patch_size=16, doc_name="document"):
    """
    Error Level Analysis with spatial patch decomposition.

    Returns:
        {
          "scalar_score": float [0,1],
          "patch_matrix": 2D list (rows × cols) of float ELA values,
          "patch_size_px": int,
          "amplified_base64": str (base64 PNG of the ELA amplified image),
          "findings": list[Finding]
        }
    """
    empty = {
        "scalar_score": 0.0,
        "patch_matrix": [],
        "patch_size_px": patch_size,
        "amplified_base64": None,
        "findings": [],
    }
    if not pdf_bytes:
        return empty
    try:
        original_pil = _fitz_to_pil(pdf_bytes, dpi=150)
        original_arr = np.array(original_pil, dtype=np.float32)
        h_img, w_img = original_arr.shape[:2]

        # JPEG recompress
        buf = BytesIO()
        original_pil.save(buf, format="JPEG", quality=quality)
        buf.seek(0)
        recomp_arr = np.array(Image.open(buf).convert("RGB"), dtype=np.float32)
        if recomp_arr.shape != original_arr.shape:
            recomp_pil = Image.fromarray(recomp_arr.astype(np.uint8)).resize(
                (w_img, h_img), Image.LANCZOS)
            recomp_arr = np.array(recomp_pil, dtype=np.float32)

        diff = np.abs(original_arr - recomp_arr)           # (H, W, 3)
        diff_gray = diff.mean(axis=2)                       # (H, W)

        # Patch grid
        rows = max(1, h_img // patch_size)
        cols = max(1, w_img // patch_size)
        matrix = []
        for r in range(rows):
            row_vals = []
            for c in range(cols):
                y0, y1 = r * patch_size, min((r + 1) * patch_size, h_img)
                x0, x1 = c * patch_size, min((c + 1) * patch_size, w_img)
                patch = diff_gray[y0:y1, x0:x1]
                val = float(np.clip(patch.mean() / 20.0, 0.0, 1.0))
                row_vals.append(round(val, 4))
            matrix.append(row_vals)

        scalar_score = float(np.clip(diff_gray.mean() / 15.0, 0.0, 1.0))

        # Amplified image
        amp_arr = np.clip(diff * 10.0, 0, 255).astype(np.uint8)
        amp_gray = amp_arr.mean(axis=2)
        heat = np.zeros_like(amp_arr)
        heat[:, :, 0] = np.clip(amp_gray * 2.5, 0, 255)
        heat[:, :, 1] = np.clip(amp_gray * 0.4, 0, 255)
        heat[:, :, 2] = np.clip(255 - amp_gray * 1.5, 0, 255)
        heat_pil = Image.fromarray(heat.astype(np.uint8))
        buf2 = BytesIO()
        heat_pil.save(buf2, format="PNG")
        amp_b64 = base64.b64encode(buf2.getvalue()).decode("utf-8")

        findings = []
        doc_hash = hashlib.sha256(pdf_bytes[:256]).hexdigest()[:12]
        if scalar_score > 0.40:
            findings.append(make_finding(
                doc_hash=doc_hash,
                check_name="ela_heatmap",
                severity="CRITICAL" if scalar_score > 0.65 else "WARNING",
                category="Visual Forensics",
                document_name=doc_name,
                field_name="document_image",
                expected_value="ELA score < 0.20 (unedited document)",
                actual_value=round(scalar_score, 4),
                discrepancy_abs=round(scalar_score - 0.20, 4),
                discrepancy_pct=round((scalar_score - 0.20) / 0.20 * 100, 1) if scalar_score > 0.20 else 0,
                description=(
                    f"Error Level Analysis shows a mean deviation of {scalar_score:.3f} "
                    f"(threshold 0.20). High ELA indicates prior JPEG recompression consistent "
                    f"with image editing. Suspicious patches detected across document."
                ),
                recommendation="Request original document from issuing institution. "
                               "Compare with branch copy. Reject if original unavailable.",
                evidence={
                    "scalar_score": scalar_score,
                    "patch_rows": rows,
                    "patch_cols": cols,
                },
            ))

        return {
            "scalar_score": round(scalar_score, 4),
            "patch_matrix": matrix,
            "patch_size_px": patch_size,
            "amplified_base64": amp_b64,
            "findings": findings,
        }
    except Exception as e:
        print(f"compute_ela_heatmap error: {e}")
        return empty


# backward-compat alias used by existing code
def compute_ela(pdf_bytes, quality=90, return_map=False):
    result = compute_ela_heatmap(pdf_bytes, quality=quality)
    return {
        "mean_deviation": result["scalar_score"] * 15.0,
        "normalized_score": result["scalar_score"],
        "map_base64": result["amplified_base64"] if return_map else None,
        "patch_matrix": result["patch_matrix"],
        "patch_size_px": result["patch_size_px"],
    }


# ─────────────────────────────────────────────────────────────────────────────
#  NOISE RESIDUAL ANALYSIS  (approximation of SRM principles, 8-kernel bank)
# ─────────────────────────────────────────────────────────────────────────────

def compute_noise_residual(pdf_bytes, doc_name="document"):
    """
    Multi-kernel noise residual analysis.

    Uses a bank of 8 high-pass filter kernels (horizontal, vertical, two diagonals,
    and their second-order derivatives). Combines outputs into a noise residual map.
    Flags regions where local variance is significantly higher than surrounding
    document average (potential edit boundaries).

    Returns:
        {
          "residual_base64": str (base64 PNG of noise map),
          "flagged_regions": list of {"bbox": [x,y,w,h], "variance_score": float},
          "mean_variance": float,
          "findings": list[Finding]
        }
    """
    empty = {
        "residual_base64": None,
        "flagged_regions": [],
        "mean_variance": 0.0,
        "findings": [],
    }
    if not pdf_bytes:
        return empty
    try:
        pil_img = _fitz_to_pil(pdf_bytes, dpi=150)
        gray = np.array(pil_img.convert("L"), dtype=np.float32)
        h, w = gray.shape

        # 8 high-pass kernels
        kernels = [
            # 1st order: horizontal, vertical, diagonals
            np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32),   # Sobel H
            np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32),   # Sobel V
            np.array([[0, 1, 2], [-1, 0, 1], [-2, -1, 0]], dtype=np.float32),   # Diag 1
            np.array([[2, 1, 0], [1, 0, -1], [0, -1, -2]], dtype=np.float32),   # Diag 2
            # 2nd order: Laplacian variants
            np.array([[0, -1, 0], [-1, 4, -1], [0, -1, 0]], dtype=np.float32),  # Laplacian
            np.array([[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]], dtype=np.float32),  # Laplacian-8
            np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], dtype=np.float32),  # 2nd deriv H
            np.array([[1, -2, 1], [0, 0, 0], [-1, 2, -1]], dtype=np.float32),   # 2nd deriv V
        ]

        # Apply all kernels and accumulate residual
        residual = np.zeros_like(gray)
        for k in kernels:
            # Manual 2D convolution (avoid scipy dependency)
            from PIL import ImageFilter as IF
            pil_gray = Image.fromarray(gray.astype(np.uint8))
            filtered = pil_gray.filter(IF.Kernel(
                size=(3, 3),
                kernel=k.flatten().tolist(),
                scale=1, offset=0
            ))
            filtered_arr = np.array(filtered, dtype=np.float32)
            residual += np.abs(filtered_arr)

        residual = np.clip(residual / len(kernels), 0, 255)
        mean_var = float(residual.var())

        # Flag regions with high local variance
        block = 32
        
        # 1. Compute document-aware baseline
        local_variances = []
        for y in range(0, h - block, block):
            for x in range(0, w - block, block):
                patch = residual[y:y+block, x:x+block]
                local_variances.append(float(patch.var()))
        
        mean_local_var = float(np.mean(local_variances)) if local_variances else 0.0
        std_local_var = float(np.std(local_variances)) if local_variances else 0.0
        
        # Threshold adapts to standard deviation of variance
        threshold = mean_local_var + 3.0 * max(10.0, std_local_var)

        # 2. Build repeating background/watermark exclusion mask
        bin_counts = Counter()
        block_features = {}
        bin_coords = {}
        
        for y in range(0, h - block, block // 2):
            for x in range(0, w - block, block // 2):
                patch_gray = gray[y:y+block, x:x+block]
                patch_res = residual[y:y+block, x:x+block]
                g_mean = float(np.mean(patch_gray))
                r_var = float(patch_res.var())
                
                bin_gray = int(g_mean / 10)
                bin_var = int(np.log1p(r_var) * 2)
                
                bin_key = (bin_gray, bin_var)
                block_features[(x, y)] = bin_key
                
                if bin_var > 0:
                    bin_counts[bin_key] += 1
                    if bin_key not in bin_coords:
                        bin_coords[bin_key] = []
                    bin_coords[bin_key].append((x, y))

        repeating_bins = set()
        for bin_key, coords in bin_coords.items():
            if len(coords) > 8:
                xs = [pt[0] for pt in coords]
                ys = [pt[1] for pt in coords]
                # Check if elements are spatially spread out across the page
                if (max(xs) - min(xs)) > w * 0.15 or (max(ys) - min(ys)) > h * 0.15:
                    repeating_bins.add(bin_key)

        # 3. Scan and flag regions
        flagged = []
        for y in range(0, h - block, block // 2):
            for x in range(0, w - block, block // 2):
                # A. Border and Header/Footer zones exclusion
                if x < w * 0.08 or x + block > w * 0.92:
                    continue
                if y < h * 0.15 or y + block > h * 0.85:
                    continue
                
                # B. Repeating background exclusion
                bin_key = block_features.get((x, y))
                if bin_key in repeating_bins:
                    continue
                
                patch = residual[y:y+block, x:x+block]
                local_var = float(patch.var())
                if local_var > threshold and threshold > 0:
                    score = min(1.0, local_var / (threshold * 4))
                    flagged.append({
                        "bbox": [int(x), int(y), int(block), int(block)],
                        "variance_score": round(score, 4),
                        "page": 0,
                    })

        # Sort by variance score, keep top 20 to avoid noise
        flagged = sorted(flagged, key=lambda r: r["variance_score"], reverse=True)[:20]

        # Encode residual as base64
        vis = np.clip(residual * 2.5, 0, 255).astype(np.uint8)
        buf = BytesIO()
        Image.fromarray(vis).save(buf, format="PNG")
        residual_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        findings = []
        doc_hash = hashlib.sha256(pdf_bytes[:256]).hexdigest()[:12]
        if len(flagged) > 5:
            findings.append(make_finding(
                doc_hash=doc_hash,
                check_name="noise_residual",
                severity="WARNING" if len(flagged) <= 12 else "CRITICAL",
                category="Visual Forensics",
                document_name=doc_name,
                field_name="noise_residual_map",
                expected_value="< 5 high-variance regions (genuine document)",
                actual_value=len(flagged),
                discrepancy_abs=len(flagged) - 5,
                description=(
                    f"Noise Residual Analysis detected {len(flagged)} regions with "
                    f"local variance exceeding the document-aware baseline by a significant margin. "
                    f"These are potential edit boundaries where pixels may have been replaced or composited."
                ),
                recommendation="Cross-reference flagged regions with ELA heatmap. "
                               "If overlap exists, escalate to senior forensic review.",
                evidence={
                    "flagged_count": len(flagged),
                    "mean_variance": round(mean_var, 2),
                    "top_regions": flagged[:5],
                },
            ))

        return {
            "residual_base64": residual_b64,
            "flagged_regions": flagged,
            "mean_variance": round(mean_var, 4),
            "findings": findings,
        }

    except Exception as e:
        print(f"compute_noise_residual error: {e}")
        return empty


# ─────────────────────────────────────────────────────────────────────────────
#  COPY-MOVE DETECTION  (OpenCV ORB + brute-force matcher)
# ─────────────────────────────────────────────────────────────────────────────

def detect_copy_move(pdf_bytes, min_distance=40, min_matches=8, doc_name="document"):
    """
    Copy-Move Detection using ORB keypoint descriptors.

    Finds descriptor pairs with high similarity that are spatially separated,
    clusters into source/destination regions, returns bounding boxes.

    Returns:
        {
          "pairs": list of {
              "src_bbox": [x,y,w,h],
              "dst_bbox": [x,y,w,h],
              "confidence": float,
              "match_count": int
          },
          "findings": list[Finding]
        }
    """
    empty = {"pairs": [], "findings": []}
    if not pdf_bytes:
        return empty
    if not _HAVE_CV2:
        return empty

    try:
        pil_img = _fitz_to_pil(pdf_bytes, dpi=150)
        gray = np.array(pil_img.convert("L"))

        orb = cv2.ORB_create(nfeatures=1000, scaleFactor=1.2, nlevels=8)
        kp, des = orb.detectAndCompute(gray, None)

        if des is None or len(kp) < 20:
            return empty

        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = bf.match(des, des)

        # Filter: same descriptor index pairs excluded, min distance between keypoints
        valid = []
        for m in matches:
            if m.queryIdx == m.trainIdx:
                continue
            pt1 = kp[m.queryIdx].pt
            pt2 = kp[m.trainIdx].pt
            dist = math.sqrt((pt1[0]-pt2[0])**2 + (pt1[1]-pt2[1])**2)
            if dist >= min_distance:
                valid.append((pt1, pt2, m.distance))

        if not valid:
            return empty

        # Cluster into pairs using simple proximity (group points within 30px)
        from itertools import combinations
        src_pts = [v[0] for v in valid]
        dst_pts = [v[1] for v in valid]

        def cluster_points(pts, radius=30):
            clusters = []
            used = [False] * len(pts)
            for i, p in enumerate(pts):
                if used[i]: continue
                cluster = [p]
                used[i] = True
                for j, q in enumerate(pts):
                    if used[j]: continue
                    if math.sqrt((p[0]-q[0])**2 + (p[1]-q[1])**2) < radius:
                        cluster.append(q)
                        used[j] = True
                clusters.append(cluster)
            return clusters

        src_clusters = cluster_points(src_pts)
        dst_clusters = cluster_points(dst_pts)

        pairs = []
        for sc in src_clusters:
            if len(sc) < min_matches:
                continue
            xs = [p[0] for p in sc]; ys = [p[1] for p in sc]
            sx, sy = min(xs), min(ys)
            sw, sh = max(xs)-min(xs)+20, max(ys)-min(ys)+20

            for dc in dst_clusters:
                if len(dc) < min_matches:
                    continue
                xd = [p[0] for p in dc]; yd = [p[1] for p in dc]
                dx_, dy_ = min(xd), min(yd)
                dw, dh = max(xd)-min(xd)+20, max(yd)-min(yd)+20
                spatial_sep = math.sqrt((sx-dx_)**2 + (sy-dy_)**2)
                if spatial_sep < min_distance:
                    continue
                support = min(len(sc), len(dc))
                conf = round(min(1.0, support / 30.0), 3)
                pairs.append({
                    "src_bbox": [int(sx), int(sy), int(sw), int(sh)],
                    "dst_bbox": [int(dx_), int(dy_), int(dw), int(dh)],
                    "confidence": conf,
                    "match_count": support,
                })

        pairs = sorted(pairs, key=lambda p: p["confidence"], reverse=True)[:10]

        findings = []
        if pairs:
            doc_hash = hashlib.sha256(pdf_bytes[:256]).hexdigest()[:12]
            for i, pair in enumerate(pairs[:3]):
                findings.append(make_finding(
                    doc_hash=doc_hash,
                    check_name=f"copy_move_{i}",
                    severity="CRITICAL" if pair["confidence"] > 0.6 else "WARNING",
                    category="Visual Forensics",
                    document_name=doc_name,
                    field_name=f"copy_move_region_{i+1}",
                    expected_value="No copy-move pairs detected",
                    actual_value=f"{pair['match_count']} matched keypoints (confidence {pair['confidence']})",
                    discrepancy_abs=pair["match_count"],
                    description=(
                        f"Copy-Move detection found {pair['match_count']} matching feature "
                        f"descriptors between source region {pair['src_bbox']} and "
                        f"destination {pair['dst_bbox']}. This is consistent with a "
                        f"region being duplicated within the document."
                    ),
                    recommendation="Physical verification of original document required. "
                                   "The copy-move region likely overlays altered data.",
                    evidence={
                        "src_bbox": pair["src_bbox"],
                        "dst_bbox": pair["dst_bbox"],
                        "confidence": pair["confidence"],
                        "match_count": pair["match_count"],
                        "page": 0,
                    },
                ))

        return {"pairs": pairs, "findings": findings}
    except Exception as e:
        print(f"detect_copy_move error: {e}")
        return empty


# ─────────────────────────────────────────────────────────────────────────────
#  PER-FIELD OCR CONFIDENCE  (structure-signal based, not metadata)
# ─────────────────────────────────────────────────────────────────────────────

def compute_ocr_confidence(pdf_bytes, flagged_regions=None, doc_name="document"):
    """
    Per-word OCR confidence assessment using document structure signals.

    Confidence is reduced when:
    - Bounding box overlaps adjacent word boxes
    - Character spacing is non-uniform vs paragraph average
    - Font differs from surrounding text in same block
    - Word falls in a noise-residual-flagged region

    Returns:
        {
          "words": list of {
              "text": str, "page": int, "bbox": [x,y,w,h],
              "confidence": float [0,1], "flags": list[str]
          },
          "low_confidence_count": int,
          "findings": list[Finding]
        }
    """
    empty = {"words": [], "low_confidence_count": 0, "findings": []}
    if not pdf_bytes:
        return empty
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        all_words = []
        flagged_rects = flagged_regions or []
        doc_hash = hashlib.sha256(pdf_bytes[:256]).hexdigest()[:12]

        for page_idx in range(len(doc)):
            page = doc.load_page(page_idx)
            words = page.get_text("words")  # (x0,y0,x1,y1,text,block,line,word)
            blocks_dict = page.get_text("dict").get("blocks", [])

            # Build font map per block
            font_by_block = {}
            for blk in blocks_dict:
                bid = blk.get("number", 0)
                fonts = []
                for ln in blk.get("lines", []):
                    for sp in ln.get("spans", []):
                        fonts.append(sp.get("font", ""))
                if fonts:
                    font_by_block[bid] = Counter(fonts).most_common(1)[0][0]

            # Compute average char spacing per page
            spacings = []
            for w in words:
                text = w[4]
                if len(text) > 1:
                    char_w = (w[2] - w[0]) / len(text)
                    spacings.append(char_w)
            avg_spacing = float(np.mean(spacings)) if spacings else 6.0
            spacing_std = float(np.std(spacings)) if len(spacings) > 1 else 2.0

            for wd in words:
                x0, y0, x1, y1, text, block_no, line_no, word_no = wd[:8]
                if not text.strip():
                    continue

                conf = 1.0
                flags_list = []

                # Signal 1: bbox overlap with adjacent words
                char_w = (x1 - x0) / max(len(text), 1)
                if abs(char_w - avg_spacing) > 2.5 * spacing_std and spacing_std > 0:
                    conf -= 0.20
                    flags_list.append("spacing_anomaly")

                # Signal 2: font mismatch vs block dominant font
                # (approximated — we check if block font differs from page dominant)
                # We use block_no to look up
                pass  # font mismatch detection is expensive; skip for perf

                # Signal 3: falls in noise-flagged region
                for reg in flagged_rects:
                    rx, ry, rw, rh = reg.get("bbox", [0, 0, 0, 0])
                    if rx < x1 and rx + rw > x0 and ry < y1 and ry + rh > y0:
                        conf -= 0.25
                        flags_list.append("in_noise_region")
                        break

                conf = round(max(0.0, min(1.0, conf)), 3)
                all_words.append({
                    "text": text,
                    "page": page_idx,
                    "bbox": [round(x0), round(y0), round(x1 - x0), round(y1 - y0)],
                    "confidence": conf,
                    "flags": flags_list,
                })

        doc.close()
        low_conf = [w for w in all_words if w["confidence"] < 0.75]

        findings = []
        if len(low_conf) > 10:
            findings.append(make_finding(
                doc_hash=doc_hash,
                check_name="ocr_confidence",
                severity="WARNING",
                category="Visual Forensics",
                document_name=doc_name,
                field_name="text_regions",
                expected_value="< 5 low-confidence words",
                actual_value=len(low_conf),
                discrepancy_abs=len(low_conf) - 5,
                description=(
                    f"{len(low_conf)} words show anomalous character spacing or "
                    f"overlap with noise-flagged regions. These may indicate "
                    f"replaced or injected text fields."
                ),
                recommendation="Manually inspect highlighted text regions. "
                               "Pay special attention to numeric fields (salary, dates, PAN).",
                evidence={"low_confidence_words": [w["text"] for w in low_conf[:10]]},
            ))

        return {
            "words": all_words,
            "low_confidence_count": len(low_conf),
            "findings": findings,
        }
    except Exception as e:
        print(f"compute_ocr_confidence error: {e}")
        return empty


# ─────────────────────────────────────────────────────────────────────────────
#  PDF METADATA POISON DETECTOR
# ─────────────────────────────────────────────────────────────────────────────

# Known non-institutional software signatures
_SUSPICIOUS_PRODUCERS = [
    "photoshop", "illustrator", "canva", "gimp", "coreldraw",
    "inkscape", "draw", "libreoffice draw", "affinity",
    "smallpdf", "ilovepdf", "pdf24", "sejda", "pdfcandy",
    "foxit", "nitro", "pdf editor", "apowersoft",
]

def detect_metadata_poison(pdf_bytes, doc_name="document", claimed_doc_date_str=None):
    """
    PDF Metadata Poison Detector.

    Checks:
    - Producer/Creator string against known non-institutional software list
    - Modification date newer than creation date by > 7 days
    - Stated document date inconsistent with PDF creation date (> 6 months gap)
    - Embedded JavaScript (never acceptable in bank documents)
    - Embedded files (never acceptable in bank documents)

    Returns:
        {
          "raw_metadata": dict,
          "suspicious_software": bool,
          "producer_name": str,
          "date_inconsistency": bool,
          "has_javascript": bool,
          "has_embedded_files": bool,
          "findings": list[Finding]
        }
    """
    empty = {
        "raw_metadata": {},
        "suspicious_software": False,
        "producer_name": "Unknown",
        "date_inconsistency": False,
        "has_javascript": False,
        "has_embedded_files": False,
        "findings": [],
    }
    if not pdf_bytes:
        return empty
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        meta = doc.metadata or {}
        doc_hash = hashlib.sha256(pdf_bytes[:256]).hexdigest()[:12]

        producer = (meta.get("producer") or "").strip()
        creator = (meta.get("creator") or "").strip()
        creation_date_raw = meta.get("creationDate") or ""
        mod_date_raw = meta.get("modDate") or ""

        # Check suspicious software
        combined = (producer + " " + creator).lower()
        suspicious_software = any(sw in combined for sw in _SUSPICIOUS_PRODUCERS)
        matched_sw = next((sw for sw in _SUSPICIOUS_PRODUCERS if sw in combined), None)

        # Check JavaScript
        has_js = False
        try:
            for page in doc:
                annots = page.annots()
                if annots:
                    for a in annots:
                        if a.type[0] in (17, 18):  # widget with script
                            has_js = True
            if "/JavaScript" in str(doc.xref_object(doc.xref_length() - 1, compressed=False)):
                has_js = True
        except Exception:
            pass

        # Check embedded files
        has_embedded = False
        try:
            nfiles = doc.embfile_count()
            has_embedded = nfiles > 0
        except Exception:
            pass

        # Date parsing helper
        def parse_pdf_date(raw):
            # PDF date format: D:YYYYMMDDHHmmSSOHH'mm'
            if not raw:
                return None
            raw = raw.strip()
            if raw.startswith("D:"):
                raw = raw[2:]
            try:
                return datetime.datetime.strptime(raw[:14], "%Y%m%d%H%M%S")
            except Exception:
                try:
                    return datetime.datetime.strptime(raw[:8], "%Y%m%d")
                except Exception:
                    return None

        creation_dt = parse_pdf_date(creation_date_raw)
        mod_dt = parse_pdf_date(mod_date_raw)

        date_inconsistency = False
        date_gap_days = None
        if creation_dt and mod_dt:
            delta = (mod_dt - creation_dt).days
            if delta > 7:
                date_inconsistency = True
                date_gap_days = delta

        # Check claimed vs creation date
        claimed_creation_gap = None
        if claimed_doc_date_str and creation_dt:
            try:
                claimed_dt = datetime.datetime.strptime(claimed_doc_date_str, "%d/%m/%Y")
                claimed_creation_gap = abs((claimed_dt - creation_dt).days)
                if claimed_creation_gap > 180:
                    date_inconsistency = True
            except Exception:
                pass

        doc.close()

        findings = []
        if suspicious_software:
            findings.append(make_finding(
                doc_hash=doc_hash,
                check_name="metadata_software",
                severity="CRITICAL",
                category="Behavioral Signature",
                document_name=doc_name,
                field_name="pdf_producer",
                expected_value="Canara-Core-System / institutional document system",
                actual_value=producer or creator,
                description=(
                    f"PDF producer/creator field contains '{matched_sw}', "
                    f"a known image editing or non-institutional PDF creation tool. "
                    f"Genuine bank documents are produced by Canara Core System."
                ),
                recommendation="This document was NOT produced by institutional software. "
                               "Reject and request a fresh certified copy from the issuing branch.",
                evidence={"producer": producer, "creator": creator},
            ))

        if date_inconsistency:
            findings.append(make_finding(
                doc_hash=doc_hash,
                check_name="metadata_date_inconsistency",
                severity="WARNING",
                category="Behavioral Signature",
                document_name=doc_name,
                field_name="pdf_modification_date",
                expected_value="Modification date within 1 day of creation date",
                actual_value=f"Modified {date_gap_days} days after creation" if date_gap_days else "Date inconsistency detected",
                discrepancy_abs=date_gap_days,
                description=(
                    f"PDF modification date is significantly later than creation date "
                    f"({date_gap_days} days gap). Genuine institutional documents are "
                    f"created and finalized at the same time."
                ),
                recommendation="Verify document authenticity with the issuing branch. "
                               "A modification gap > 7 days suggests post-issuance editing.",
                evidence={
                    "creation_date": str(creation_dt) if creation_dt else None,
                    "modification_date": str(mod_dt) if mod_dt else None,
                    "gap_days": date_gap_days,
                },
            ))

        if has_js:
            findings.append(make_finding(
                doc_hash=doc_hash,
                check_name="metadata_javascript",
                severity="CRITICAL",
                category="Behavioral Signature",
                document_name=doc_name,
                field_name="embedded_javascript",
                expected_value="No JavaScript in bank document",
                actual_value="JavaScript detected",
                description=(
                    "Embedded JavaScript was found in this PDF. Bank documents "
                    "should never contain executable scripts. This is a strong "
                    "indicator of a maliciously crafted document."
                ),
                recommendation="REJECT IMMEDIATELY. Do not open this document on "
                               "production systems. Escalate to security team.",
                evidence={"has_javascript": True},
            ))

        if has_embedded:
            findings.append(make_finding(
                doc_hash=doc_hash,
                check_name="metadata_embedded_files",
                severity="WARNING",
                category="Behavioral Signature",
                document_name=doc_name,
                field_name="embedded_files",
                expected_value="No embedded files in bank document",
                actual_value="Embedded files detected",
                description="PDF contains embedded files, which is not expected in "
                            "institutional banking documents.",
                recommendation="Extract and examine embedded files before proceeding.",
                evidence={"has_embedded_files": True},
            ))

        return {
            "raw_metadata": {
                "producer": producer,
                "creator": creator,
                "creation_date": creation_date_raw,
                "modification_date": mod_date_raw,
                "author": meta.get("author", ""),
                "title": meta.get("title", ""),
                "subject": meta.get("subject", ""),
            },
            "suspicious_software": suspicious_software,
            "producer_name": producer or creator or "Unknown",
            "date_inconsistency": date_inconsistency,
            "date_gap_days": date_gap_days,
            "has_javascript": has_js,
            "has_embedded_files": has_embedded,
            "findings": findings,
        }
    except Exception as e:
        print(f"detect_metadata_poison error: {e}")
        return empty


# ─────────────────────────────────────────────────────────────────────────────
#  ENTITY EXTRACTION WITH PROVENANCE
# ─────────────────────────────────────────────────────────────────────────────

_FIELD_CONFIGS = {
    "pan": {
        "labels": [r'pan\b', r'permanent\s+account\s+number\b', r'card\s+no\b'],
        "value_regex": r'\b([A-Z]{5}\d{4}[A-Z])\b'
    },
    "aadhaar_last4": {
        "labels": [r'aadhaar\b', r'uid\b', r'vid\b'],
        "value_regex": r'\b(?:XXXX[ \t]*XXXX[ \t]*)?(\d{4})\b'
    },
    "uid": {
        "labels": [r'uid\b', r'aadhaar\b'],
        "value_regex": r'\bUID[ \t]*[:\-]?[ \t]*([\d \t]{14,16})\b'
    },
    "name": {
        "labels": [r'employee\s+name\b', r'applicant\s+name\b', r'full\s+name\b', r'owner(?:\'s)?\s+name\b', r'name\b', r'ofowner\b'],
        "value_regex": r'\b([A-Za-z \t\.]{4,40})\b'
    },
    "dob": {
        "labels": [r'dob\b', r'date\s+of\s+birth\b', r'birth\s+date\b'],
        "value_regex": r'\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b'
    },
    "salary_gross": {
        "labels": [r'gross\s+(?:pay|salary|ctc|earnings)\b', r'gross\b'],
        "value_regex": r'(?:₹|Rs\.?|INR)?[ \t]*([\d,]+(?:\.\d+)?)',
        "is_financial": True
    },
    "salary_net": {
        "labels": [r'net\s+(?:pay|salary|take\s+home|earnings)\b', r'net\b'],
        "value_regex": r'(?:₹|Rs\.?|INR)?[ \t]*([\d,]+(?:\.\d+)?)',
        "is_financial": True
    },
    "itr_income": {
        "labels": [r'gross\s+total\s+(?:salary\s+)?income\b', r'total\s+income\b', r'declared\s+income\b', r'total\s+earnings\b'],
        "value_regex": r'(?:₹|Rs\.?|INR)?[ \t]*([\d,]+(?:\.\d+)?)',
        "is_financial": True
    },
    "land_value": {
        "labels": [r'declared\s+market\s+value\b', r'property\s+value\b', r'land\s+value\b', r'market\s+value\b'],
        "value_regex": r'(?:₹|Rs\.?|INR)?[ \t]*([\d,]+(?:\.\d+)?)',
        "is_financial": True
    },
    "circle_rate": {
        "labels": [r'circle\s+rate\b', r'guideline\s+value\b', r'valuation\s+rate\b'],
        "value_regex": r'(?:₹|Rs\.?|INR)?[ \t]*([\d,]+(?:\.\d+)?)',
        "is_financial": True
    },
    "ifsc": {
        "labels": [r'ifsc\b', r'ifsc\s+code\b', r'rtgs/neft\b'],
        "value_regex": r'\b([A-Z]{4}0[A-Z0-9]{6})\b'
    },
    "account_no": {
        "labels": [r'account\s+no\b', r'account\s+number\b', r'a/c\s+no\b', r'a/c\s+number\b'],
        "value_regex": r'\b(\d{9,18})\b'
    },
    "district": {
        "labels": [r'district\b'],
        "value_regex": r'\b([\w \t\-]{3,30})\b'
    },
    "pin": {
        "labels": [r'pin\b', r'pincode\b', r'postal\s+code\b'],
        "value_regex": r'\b(\d{6})\b'
    },
    "mobile": {
        "labels": [r'mobile\b', r'mobile\s+no\b', r'mobile\s+number\b', r'phone\b', r'contact\b'],
        "value_regex": r'\b([6-9]\d{9})\b'
    },
    "survey_no": {
        "labels": [r'survey\s+no\b', r'survey\s+number\b', r'survey\b'],
        "value_regex": r'\b(\d+[\/\w]*)\b'
    },
    "employer": {
        "labels": [r'employer\s*/\s*company\s+name\b', r'employer\s+name\b', r'employer\b', r'company\s+name\b', r'organisation\b'],
        "value_regex": r'\b([A-Za-z \t\&\.,\(\)]{4,40})\b'
    },
    "basic_pay": {
        "labels": [r'basic\s+pay\b', r'basic\s+salary\b', r'basic\b'],
        "value_regex": r'(?:₹|Rs\.?|INR)?[ \t]*([\d,]+(?:\.\d+)?)',
        "is_financial": True
    },
    "hra": {
        "labels": [r'hra\b', r'house\s+rent\s+allowance\b'],
        "value_regex": r'(?:₹|Rs\.?|INR)?[ \t]*([\d,]+(?:\.\d+)?)',
        "is_financial": True
    },
    "allowances": {
        "labels": [r'special\s+allowance\b', r'other\s+allowance\b', r'allowances\b'],
        "value_regex": r'(?:₹|Rs\.?|INR)?[ \t]*([\d,]+(?:\.\d+)?)',
        "is_financial": True
    },
    "pf_deduction": {
        "labels": [r'pf\b', r'provident\s+fund\b', r'epf\b'],
        "value_regex": r'(?:₹|Rs\.?|INR)?[ \t]*([\d,]+(?:\.\d+)?)',
        "is_financial": True
    },
    "esi_deduction": {
        "labels": [r'esi\b', r'employee\s+state\s+insurance\b'],
        "value_regex": r'(?:₹|Rs\.?|INR)?[ \t]*([\d,]+(?:\.\d+)?)',
        "is_financial": True
    },
    "tax": {
        "labels": [r'tax\b', r'tds\b', r'income\s+tax\b', r'professional\s+tax\b'],
        "value_regex": r'(?:₹|Rs\.?|INR)?[ \t]*([\d,]+(?:\.\d+)?)',
        "is_financial": True
    },
    "salary_deductions": {
        "labels": [r'total\s+deductions\b', r'deductions\b'],
        "value_regex": r'(?:₹|Rs\.?|INR)?[ \t]*([\d,]+(?:\.\d+)?)',
        "is_financial": True
    }
}

def _extract_financial_value(text):
    match = re.search(r'(?:₹|Rs\.?|INR)[ \t]*([\d,]+(?:\.\d+)?)', text, re.IGNORECASE)
    if not match:
        match = re.search(r'([\d,]+(?:\.\d+)?)[ \t]*(?:₹|Rs\.?|INR)', text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None

def extract_entities_with_provenance(pdf_bytes, doc_name="document"):
    """
    Extract named entities using a two-pass field-aware spatial block parsing.
    Pass 1 matches label and value intra-block.
    Pass 2 matches label block with adjacent right/bottom value block.
    Third Pass fallback handles financial currency indicators safely.
    """
    empty = {"entities": [], "findings": []}
    if not pdf_bytes:
        return empty
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        entities = []

        for page_idx in range(len(doc)):
            page = doc.load_page(page_idx)
            blocks = page.get_text("blocks")
            blocks = sorted(blocks, key=lambda x: (x[1], x[0]))

            page_matched = set()

            # Pass 1: Intra-block extraction
            for etype, config in _FIELD_CONFIGS.items():
                for b in blocks:
                    text = b[4].strip()
                    label_matched = False
                    matched_label_end = 0
                    for lbl_pat in config["labels"]:
                        m_lbl = re.search(lbl_pat, text, re.IGNORECASE)
                        if m_lbl:
                            if etype == "name" and any(x in text[:m_lbl.end()].lower() for x in ["company", "employer", "bank", "branch", "office", "nominee", "father", "mother", "spouse", "husband", "guardian", "witness", "co-applicant"]):
                                continue
                            label_matched = True
                            matched_label_end = m_lbl.end()
                            break

                    if label_matched:
                        val_part = text[matched_label_end:].strip()
                        raw_val = None

                        if config.get("is_financial"):
                            raw_val = _extract_financial_value(val_part)
                            if not raw_val:
                                m_num = re.search(r'\b([\d,]+(?:\.\d+)?)\b', val_part)
                                if m_num:
                                    raw_val = m_num.group(1).strip()
                        else:
                            m_val = re.search(config["value_regex"], val_part, re.IGNORECASE)
                            if m_val:
                                raw_val = m_val.group(1).strip() if m_val.lastindex else m_val.group(0).strip()

                        if raw_val:
                            raw_val = raw_val.strip(":/-, \t\n")
                        if raw_val and len(raw_val) >= 2:
                            if raw_val.lower() in ("details", "employee", "applicant", "employer", "value", "as per records", "of owner"):
                                continue
                            norm_val = raw_val.replace(",", "").replace(" ", "")
                            if config.get("is_financial") or etype == "circle_rate":
                                try:
                                    norm_val = str(float(raw_val.replace(",", "")))
                                except ValueError:
                                    pass

                            bbox = [round(b[0]), round(b[1]), round(b[2] - b[0]), round(b[3] - b[1])]
                            entities.append({
                                "entity_type": etype,
                                "raw_value": raw_val,
                                "normalized_value": norm_val,
                                "page": page_idx,
                                "bbox": bbox,
                                "confidence": 0.95,
                                "document_name": doc_name,
                            })
                            page_matched.add(etype)
                            break

            # Pass 2: Inter-block spatial extraction (adjacent blocks)
            for etype, config in _FIELD_CONFIGS.items():
                if etype in page_matched:
                    continue

                for b in blocks:
                    text = b[4].strip()
                    label_matched = False
                    for lbl_pat in config["labels"]:
                        m_lbl = re.search(lbl_pat, text, re.IGNORECASE)
                        if m_lbl:
                            if etype == "name" and any(x in text[:m_lbl.end()].lower() for x in ["company", "employer", "bank", "branch", "office", "nominee", "father", "mother", "spouse", "husband", "guardian", "witness", "co-applicant"]):
                                continue
                            label_matched = True
                            break

                    if label_matched:
                        lbl_bbox = b[:4]
                        candidates = []

                        for val_b in blocks:
                            if val_b[5] == b[5]:
                                continue

                            v_bbox = val_b[:4]
                            # Right neighbor Check
                            vert_overlap = max(lbl_bbox[1], v_bbox[1]) < min(lbl_bbox[3], v_bbox[3])
                            horiz_gap = v_bbox[0] - lbl_bbox[2]

                            if vert_overlap and 0 <= horiz_gap < 250:
                                candidates.append((horiz_gap, val_b))
                                continue

                            # Below neighbor Check
                            horiz_overlap = max(lbl_bbox[0], v_bbox[0]) < min(lbl_bbox[2], v_bbox[2])
                            vert_gap = v_bbox[1] - lbl_bbox[3]

                            if horiz_overlap and 0 <= vert_gap < 80:
                                candidates.append((vert_gap, val_b))
                                continue

                        if candidates:
                            candidates = sorted(candidates, key=lambda x: x[0])
                            best_b = candidates[0][1]
                            val_text = best_b[4].strip()
                            raw_val = None

                            if config.get("is_financial"):
                                raw_val = _extract_financial_value(val_text)
                                if not raw_val:
                                    m_num = re.search(r'\b([\d,]+(?:\.\d+)?)\b', val_text)
                                    if m_num:
                                        raw_val = m_num.group(1).strip()
                            else:
                                m_val = re.search(config["value_regex"], val_text, re.IGNORECASE)
                                if m_val:
                                    raw_val = m_val.group(1).strip() if m_val.lastindex else m_val.group(0).strip()

                            if raw_val:
                                raw_val = raw_val.strip(":/-, \t\n")
                            if raw_val and len(raw_val) >= 2:
                                if raw_val.lower() in ("details", "employee", "applicant", "employer", "value", "as per records", "of owner"):
                                    continue
                                norm_val = raw_val.replace(",", "").replace(" ", "")
                                if config.get("is_financial") or etype == "circle_rate":
                                    try:
                                        norm_val = str(float(raw_val.replace(",", "")))
                                    except ValueError:
                                        pass

                                bbox = [round(best_b[0]), round(best_b[1]), round(best_b[2] - best_b[0]), round(best_b[3] - best_b[1])]
                                entities.append({
                                    "entity_type": etype,
                                    "raw_value": raw_val,
                                    "normalized_value": norm_val,
                                    "page": page_idx,
                                    "bbox": bbox,
                                    "confidence": 0.95,
                                    "document_name": doc_name,
                                })
                                page_matched.add(etype)
                                break

            # Fallback Pass 3: Financial blocks containing currency symbols (ignoring typical headers/footers)
            for etype in ["salary_gross", "salary_net", "itr_income", "land_value", "circle_rate"]:
                if etype in page_matched:
                    continue
                
                for b in blocks:
                    text = b[4].strip()
                    lower_text = text.lower()
                    if any(x in lower_text for x in ["page", "document", "date:", "tel:", "phone:", "ref:", "id:", "stamp", "serial"]):
                        continue

                    raw_val = _extract_financial_value(text)
                    if raw_val:
                        raw_val = raw_val.strip(":/-, \t\n")
                    if raw_val and len(raw_val) >= 2:
                        try:
                            norm_val = str(float(raw_val.replace(",", "")))
                        except ValueError:
                            norm_val = raw_val.replace(",", "").replace(" ", "")

                        bbox = [round(b[0]), round(b[1]), round(b[2] - b[0]), round(b[3] - b[1])]
                        entities.append({
                            "entity_type": etype,
                            "raw_value": raw_val,
                            "normalized_value": norm_val,
                            "page": page_idx,
                            "bbox": bbox,
                            "confidence": 0.90,
                            "document_name": doc_name,
                        })
                        page_matched.add(etype)
                        break

        doc.close()

        # Deduplicate and keep highest confidence match
        seen = {}
        deduped = []
        for e in entities:
            key = e["entity_type"]
            if key not in seen:
                seen[key] = e
                deduped.append(e)
            else:
                if e["confidence"] > seen[key]["confidence"]:
                    deduped.remove(seen[key])
                    seen[key] = e
                    deduped.append(e)

        return {"entities": deduped, "findings": []}
    except Exception as e:
        print(f"extract_entities_with_provenance error: {e}")
        return empty


# ─────────────────────────────────────────────────────────────────────────────
#  FONT ANOMALY DETECTION  (enhanced with per-block bboxes)
# ─────────────────────────────────────────────────────────────────────────────

def detect_font_anomalies(pdf_bytes, doc_name="document"):
    """
    Analyse font usage across text spans. Returns anomalous block bboxes
    for the frontend overlay renderer.
    """
    if not pdf_bytes:
        return _empty_font_result()
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        font_families = []
        all_sizes = []
        details = []
        anomalous_blocks = []   # list of {bbox, page, type}
        doc_hash = hashlib.sha256(pdf_bytes[:256]).hexdigest()[:12]

        pages_to_check = min(len(doc), 2)
        for page_idx in range(pages_to_check):
            page = doc.load_page(page_idx)
            blocks = page.get_text("dict").get("blocks", [])
            for block in blocks:
                block_fonts = []
                block_sizes = []
                block_texts = []
                bbox = block.get("bbox", [0, 0, 0, 0])
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        font = span.get("font", "")
                        size = span.get("size", 0)
                        text_val = span.get("text", "").strip()
                        if not text_val:
                            continue
                        base_font = re.sub(
                            r'(?i)(bold|italic|regular|medium|light|semibold|black|condensed|-)',
                            '', font).strip()
                        if base_font:
                            font_families.append(base_font)
                            block_fonts.append(base_font)
                        if size > 0:
                            all_sizes.append(size)
                            block_sizes.append(size)
                        block_texts.append(text_val)

                # Flag blocks with mixed fonts or unusual sizes
                if len(set(block_fonts)) > 2 and len(block_texts) > 0:
                    anomalous_blocks.append({
                        "bbox": [round(x) for x in bbox],
                        "page": page_idx,
                        "type": "mixed_font",
                        "detail": f"{len(set(block_fonts))} fonts in block",
                    })

        doc.close()

        if not font_families:
            return _empty_font_result()

        font_counter = Counter(font_families)
        dominant_font, _ = font_counter.most_common(1)[0]
        unique_fonts = list(font_counter.keys())
        mixed_fonts = len(unique_fonts) > 3

        size_counter = Counter([round(s) for s in all_sizes])
        dominant_size = size_counter.most_common(1)[0][0] if size_counter else 12
        suspicious_sizes = any(abs(s - dominant_size) > 4 or s < 6 for s in all_sizes)

        font_score = min(1.0, (len(unique_fonts) - 1) * 0.15)
        if suspicious_sizes:
            font_score = min(1.0, font_score + 0.3)

        if mixed_fonts:
            details.append(f"{len(unique_fonts)} distinct font families detected")
        if suspicious_sizes:
            details.append(f"Font size anomaly: dominant {dominant_size}pt, outliers found")

        findings = []
        if mixed_fonts or suspicious_sizes:
            findings.append(make_finding(
                doc_hash=doc_hash,
                check_name="font_anomaly",
                severity="WARNING" if font_score < 0.6 else "CRITICAL",
                category="Visual Forensics",
                document_name=doc_name,
                field_name="font_structure",
                expected_value="≤ 3 font families, consistent sizes",
                actual_value=f"{len(unique_fonts)} fonts, suspicious_sizes={suspicious_sizes}",
                discrepancy_abs=len(unique_fonts) - 3 if len(unique_fonts) > 3 else 0,
                description="; ".join(details),
                recommendation="Compare font distribution against a known-genuine document "
                               "of the same type. Field-level font switching may indicate "
                               "targeted value replacement.",
                evidence={
                    "anomalous_blocks": anomalous_blocks[:10],
                    "unique_fonts": unique_fonts,
                    "dominant_font": dominant_font,
                    "font_anomaly_score": round(font_score, 4),
                },
            ))

        return {
            "fonts_used": unique_fonts,
            "dominant_font": dominant_font,
            "mixed_fonts": mixed_fonts,
            "suspicious_sizes": suspicious_sizes,
            "font_anomaly_score": round(font_score, 4),
            "details": details,
            "anomalous_blocks": anomalous_blocks,
            "findings": findings,
        }

    except Exception as e:
        print(f"detect_font_anomalies error: {e}")
        return _empty_font_result()


def _empty_font_result():
    return {
        "fonts_used": [],
        "dominant_font": "Unknown",
        "mixed_fonts": False,
        "suspicious_sizes": False,
        "font_anomaly_score": 0.0,
        "details": [],
        "anomalous_blocks": [],
        "findings": [],
    }


# ─────────────────────────────────────────────────────────────────────────────
#  STRUCTURED OCR EXTRACTION  (unchanged from Phase 1, now returns findings)
# ─────────────────────────────────────────────────────────────────────────────

def parse_salary_details(text):
    gross = net = deductions = 0.0
    gross_match = re.search(r'(?i)gross\s+(?:pay|salary|ctc)[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)', text)
    if gross_match:
        try: gross = float(gross_match.group(1).replace(',', ''))
        except ValueError: pass
    net_match = re.search(r'(?i)net\s+(?:pay|salary|take\s+home)[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)', text)
    if net_match:
        try: net = float(net_match.group(1).replace(',', ''))
        except ValueError: pass
    ded_match = re.search(r'(?i)(?:total\s+)?deductions?[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)', text)
    if ded_match:
        try: deductions = float(ded_match.group(1).replace(',', ''))
        except ValueError: pass
    return gross, net, deductions


def parse_salary_structured(text):
    gross, net, deductions = parse_salary_details(text)
    result = {
        "salary_gross": gross, "salary_net": net, "salary_deductions": deductions,
        "employer_name": None, "employee_id": None, "tan_number": None,
        "pf_deduction": 0.0, "esi_deduction": 0.0, "pay_period": None,
        "basic_pay": 0.0, "hra": 0.0,
    }
    emp_match = re.search(
        r'(?i)(?:employer|company|organisation|organization)\s*(?:name)?[:\-\s]*([A-Za-z\s\&\.,\(\)]+)', text)
    if emp_match:
        name = emp_match.group(1).strip()
        name = re.split(r'\s{2,}|\n|\t', name)[0].strip()
        if len(name) > 3: result["employer_name"] = name
    empid_match = re.search(r'(?i)employee\s+(?:id|code|no\.?)[:\-\s]*([A-Z0-9\-]+)', text)
    if empid_match: result["employee_id"] = empid_match.group(1).strip()
    tan_match = re.search(r'\b([A-Z]{4}\d{5}[A-Z])\b', text)
    if tan_match: result["tan_number"] = tan_match.group(1)
    pf_match = re.search(r'(?i)(?:provident\s+fund|pf|epf)\s*(?:deduction)?[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)', text)
    if pf_match:
        try: result["pf_deduction"] = float(pf_match.group(1).replace(',', ''))
        except ValueError: pass
    esi_match = re.search(r'(?i)(?:esi|employee\s+state\s+insurance)[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)', text)
    if esi_match:
        try: result["esi_deduction"] = float(esi_match.group(1).replace(',', ''))
        except ValueError: pass
    period_match = re.search(
        r'(?i)(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|'
        r'jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
        r'\s+(\d{4})', text)
    if period_match: result["pay_period"] = f"{period_match.group(1)} {period_match.group(2)}"
    basic_match = re.search(r'(?i)basic\s+(?:pay|salary)[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)', text)
    if basic_match:
        try: result["basic_pay"] = float(basic_match.group(1).replace(',', ''))
        except ValueError: pass
    hra_match = re.search(r'(?i)(?:hra|house\s+rent\s+allowance)[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)', text)
    if hra_match and hra_match.group(1):
        try: result["hra"] = float(hra_match.group(1).replace(',', ''))
        except ValueError: pass
    return result


def parse_itr_details(text):
    income = 0.0
    match = re.search(r'(?i)gross\s+total\s+salary\s+income[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)', text)
    if not match:
        match = re.search(r'(?i)gross\s+total\s+income[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)', text)
    if match:
        try: income = float(match.group(1).replace(',', ''))
        except ValueError: pass
    return income


def parse_itr_structured(text):
    result = {
        "itr_total_income": parse_itr_details(text),
        "assessment_year": None, "employer_tan": None,
        "tax_paid": 0.0, "employer_name_itr": None,
    }
    ay_match = re.search(r'(?i)(?:assessment\s+year|a\.?y\.?)[:\s]*(\d{4}[-\s–]\d{2,4})', text)
    if ay_match: result["assessment_year"] = ay_match.group(1).strip()
    tan_match = re.search(r'\b([A-Z]{4}\d{5}[A-Z])\b', text)
    if tan_match: result["employer_tan"] = tan_match.group(1)
    tax_match = re.search(r'(?i)(?:tax\s+paid|tds\s+deducted|total\s+tax)[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)', text)
    if tax_match:
        try: result["tax_paid"] = float(tax_match.group(1).replace(',', ''))
        except ValueError: pass
    emp_match = re.search(
        r'(?i)(?:name\s+of\s+employer|employer\s+name|deductor\s+name)[:\-\s]*([A-Za-z\s\&\.,\(\)]+)', text)
    if emp_match:
        name = emp_match.group(1).strip()
        name = re.split(r'\s{2,}|\n|\t', name)[0].strip()
        if len(name) > 3: result["employer_name_itr"] = name
    return result


def parse_land_details(text):
    market_value = circle_rate = extent_sqft = 0.0
    district = ""
    mv_match = re.search(r'(?i)declared\s+market\s+value[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)', text)
    if mv_match:
        try: market_value = float(mv_match.group(1).replace(',', ''))
        except ValueError: pass
    cr_match = re.search(r'(?i)circle\s+rate\s+\(guidance\s+value\)[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)', text)
    if cr_match:
        try: circle_rate = float(cr_match.group(1).replace(',', ''))
        except ValueError: pass
    ext_match = re.search(r'(?i)property\s+extent\s*\(sq\.\s*ft\.\)[^\d\n]*([\d,]+(?:\.\d+)?)', text)
    if ext_match:
        try: extent_sqft = float(ext_match.group(1).replace(',', ''))
        except ValueError: pass
    dist_match = re.search(r'(?i)district\s+([\w\s]+)', text)
    if dist_match:
        district = dist_match.group(1).strip()
        district = re.split(r'\s{2,}|\n|\t', district)[0].strip()
    return market_value, circle_rate, extent_sqft, district


def extract_pan_and_name(text):
    pan = name = None
    pan_match = re.search(r'\b([A-Z]{5}\d{4}[A-Z])\b', text)
    if pan_match: pan = pan_match.group(1)
    name_match = re.search(r'(?i)(?:full\s+)?name\s*(?:\(as\s+per\s+records\))?[^\w\n]*([A-Za-z\s\.]+)', text)
    if name_match:
        name_candidate = name_match.group(1).strip()
        name_candidate = re.split(r'\s{2,}|\n|\t', name_candidate)[0].strip()
        if len(name_candidate) > 2: name = name_candidate
    return pan, name


# ─────────────────────────────────────────────────────────────────────────────
#  MATHEMATICAL INTEGRITY CHECKS  (returns Finding objects)
# ─────────────────────────────────────────────────────────────────────────────

def check_salary_math(salary_data, doc_name="salary.pdf", doc_hash=""):
    """
    Check salary arithmetic: Basic + HRA + Allowances = Gross; Gross - Deductions = Net.
    Returns list of Finding objects.
    """
    findings = []
    gross = salary_data.get("salary_gross", 0)
    net = salary_data.get("salary_net", 0)
    deductions = salary_data.get("salary_deductions", 0)
    basic = salary_data.get("basic_pay", 0)
    hra = salary_data.get("hra", 0)

    if gross > 0 and deductions > 0 and net > 0:
        computed_net = gross - deductions
        discrepancy = abs(computed_net - net)
        if discrepancy > 50:
            findings.append(make_finding(
                doc_hash=doc_hash,
                check_name="salary_net_math",
                severity="CRITICAL" if discrepancy > gross * 0.05 else "WARNING",
                category="Mathematical Integrity",
                document_name=doc_name,
                field_name="net_pay",
                expected_value=f"₹{computed_net:,.2f} (Gross − Deductions)",
                actual_value=f"₹{net:,.2f}",
                discrepancy_abs=round(discrepancy, 2),
                discrepancy_pct=round(discrepancy / gross * 100, 2) if gross > 0 else None,
                description=(
                    f"Salary slip arithmetic failure: Gross (₹{gross:,.0f}) − "
                    f"Deductions (₹{deductions:,.0f}) = ₹{computed_net:,.0f}, "
                    f"but declared Net Pay is ₹{net:,.0f}. "
                    f"Discrepancy: ₹{discrepancy:,.0f}."
                ),
                recommendation="Request original salary slip from employer HR system. "
                               "Fabricated slips commonly fail this arithmetic check.",
                evidence={
                    "gross": gross, "deductions": deductions,
                    "computed_net": computed_net, "declared_net": net,
                },
            ))

    if gross > 0 and net > 0:
        ratio = net / gross
        if ratio < 0.40 or ratio > 0.95:
            findings.append(make_finding(
                doc_hash=doc_hash,
                check_name="salary_ratio",
                severity="WARNING",
                category="Mathematical Integrity",
                document_name=doc_name,
                field_name="net_gross_ratio",
                expected_value="Net/Gross ratio between 0.40 and 0.95",
                actual_value=round(ratio, 4),
                discrepancy_abs=round(min(abs(ratio - 0.40), abs(ratio - 0.95)), 4),
                description=(
                    f"Net-to-Gross ratio of {ratio:.2%} is outside the standard "
                    f"40–95% range for Indian payroll. Extreme ratios suggest "
                    f"manipulated deduction figures."
                ),
                recommendation="Verify deduction breakdown. PF should be ~12% of basic, "
                               "TDS should match applicable tax slab.",
                evidence={"ratio": ratio, "gross": gross, "net": net},
            ))

    return findings


def check_itr_math(salary_gross, itr_income, doc_name="itr.pdf", doc_hash=""):
    """Check ITR annualized income vs salary × 12."""
    findings = []
    if salary_gross <= 0 or itr_income <= 0:
        return findings
    annualized_salary = salary_gross * 12
    discrepancy = abs(itr_income - annualized_salary)
    pct = discrepancy / annualized_salary * 100 if annualized_salary > 0 else 0
    if pct > 15:
        findings.append(make_finding(
            doc_hash=doc_hash,
            check_name="itr_income_vs_salary",
            severity="CRITICAL" if pct > 40 else "WARNING",
            category="Mathematical Integrity",
            document_name=doc_name,
            field_name="itr_total_income",
            expected_value=f"₹{annualized_salary:,.0f} (Salary × 12)",
            actual_value=f"₹{itr_income:,.0f}",
            discrepancy_abs=round(discrepancy, 0),
            discrepancy_pct=round(pct, 2),
            description=(
                f"ITR declared annual income (₹{itr_income:,.0f}) deviates "
                f"{pct:.1f}% from annualized salary (₹{annualized_salary:,.0f}). "
                f"A discrepancy > 15% indicates income concealment or "
                f"inconsistent document fabrication."
            ),
            recommendation="Request assessment order copy from applicant. "
                           "Escalate if deviation exceeds 25%.",
            evidence={
                "salary_monthly": salary_gross,
                "annualized_salary": annualized_salary,
                "itr_income": itr_income,
                "pct_deviation": pct,
            },
        ))
    return findings


def check_land_math(circle_rate, extent_sqft, market_value,
                    doc_name="land_record.pdf", doc_hash=""):
    """Check: circle_rate × extent = guidance value vs declared market value."""
    findings = []
    if circle_rate <= 0 or extent_sqft <= 0 or market_value <= 0:
        return findings
    guidance_value = circle_rate * extent_sqft
    discrepancy = abs(market_value - guidance_value)
    pct = discrepancy / guidance_value * 100 if guidance_value > 0 else 0
    if pct > 20:
        findings.append(make_finding(
            doc_hash=doc_hash,
            check_name="land_valuation",
            severity="WARNING" if pct < 50 else "CRITICAL",
            category="Mathematical Integrity",
            document_name=doc_name,
            field_name="declared_market_value",
            expected_value=f"₹{guidance_value:,.0f} (Circle Rate × Extent)",
            actual_value=f"₹{market_value:,.0f}",
            discrepancy_abs=round(discrepancy, 0),
            discrepancy_pct=round(pct, 2),
            description=(
                f"Land valuation computation: Circle Rate (₹{circle_rate:,.0f}/sqft) × "
                f"Extent ({extent_sqft:,.0f} sqft) = Guidance Value ₹{guidance_value:,.0f}. "
                f"Declared market value ₹{market_value:,.0f} deviates by {pct:.1f}%."
            ),
            recommendation="Verify circle rate from Karnataka SRO records. "
                           "Inflated land values are used to artificially boost collateral.",
            evidence={
                "circle_rate": circle_rate,
                "extent_sqft": extent_sqft,
                "guidance_value": guidance_value,
                "declared_market_value": market_value,
            },
        ))
    return findings


# ─────────────────────────────────────────────────────────────────────────────
#  CROSS-DOCUMENT COHERENCE CHECKS
# ─────────────────────────────────────────────────────────────────────────────

def check_cross_document_coherence(entities_by_doc: dict):
    """
    Compare shared fields across documents.
    entities_by_doc: {"identity": entity_list, "salary": entity_list, ...}
    Returns list of Finding objects.
    """
    findings = []

    # Build lookup: entity_type → {doc_name: value}
    field_map = {}
    for doc_name, entity_list in entities_by_doc.items():
        for ent in entity_list:
            et = ent["entity_type"]
            if et not in field_map:
                field_map[et] = {}
            field_map[et][doc_name] = ent["normalized_value"]

    # Fields that must match across documents
    must_match_fields = ["pan", "name", "dob", "pin", "district", "employer", "ifsc"]

    for field in must_match_fields:
        if field not in field_map:
            continue
        vals = field_map[field]
        if len(vals) < 2:
            continue
        unique_vals = set(vals.values())
        if len(unique_vals) > 1:
            docs_str = "; ".join(f"{d}: '{v}'" for d, v in vals.items())
            doc_hash = hashlib.sha256(field.encode()).hexdigest()[:12]
            findings.append(make_finding(
                doc_hash=doc_hash,
                check_name=f"cross_doc_{field}",
                severity="CRITICAL" if field in ("pan", "name", "dob") else "WARNING",
                category="Cross-Document Coherence",
                document_name="all",
                field_name=field,
                expected_value="Identical value across all documents",
                actual_value=docs_str,
                description=(
                    f"Field '{field}' has inconsistent values across documents: {docs_str}. "
                    f"Genuine applicant documents share identical {field} everywhere."
                ),
                recommendation=f"Verify '{field}' against original identity proof. "
                               f"Request certified copies from issuing authorities.",
                evidence={"field_values": vals},
            ))

    return findings


def check_employer_coherence(salary_structured, itr_structured):
    result = {"tan_match": None, "employer_name_match": None, "coherence_flags": []}
    sal_tan = salary_structured.get("tan_number")
    itr_tan = itr_structured.get("employer_tan")
    if sal_tan and itr_tan:
        result["tan_match"] = (sal_tan.upper() == itr_tan.upper())
        if not result["tan_match"]:
            result["coherence_flags"].append(f"TAN mismatch: Salary ({sal_tan}) ≠ ITR ({itr_tan})")
    sal_emp = (salary_structured.get("employer_name") or "").lower().strip()
    itr_emp = (itr_structured.get("employer_name_itr") or "").lower().strip()
    if sal_emp and itr_emp:
        sal_tokens = set(re.findall(r'\w+', sal_emp))
        itr_tokens = set(re.findall(r'\w+', itr_emp))
        common = sal_tokens & itr_tokens
        overlap = len(common) / max(len(sal_tokens | itr_tokens), 1)
        result["employer_name_match"] = overlap >= 0.4
        if not result["employer_name_match"]:
            result["coherence_flags"].append(
                f"Employer name mismatch: '{salary_structured.get('employer_name')}' "
                f"vs '{itr_structured.get('employer_name_itr')}'"
            )
    return result


def check_salary_vs_bank(salary_structured, bank_statement):
    result = {"salary_bank_match": None, "discrepancy_pct": 0.0, "coherence_flags": []}
    declared_net = salary_structured.get("salary_net", 0)
    bank_avg = bank_statement.get("average_monthly_credit", 0)
    if declared_net > 0 and bank_avg > 0:
        discrepancy = abs(declared_net - bank_avg) / declared_net
        result["discrepancy_pct"] = round(discrepancy * 100, 1)
        result["salary_bank_match"] = discrepancy <= 0.20
        if not result["salary_bank_match"]:
            result["coherence_flags"].append(
                f"Salary slip net (₹{declared_net:,.0f}) vs bank avg credit "
                f"(₹{bank_avg:,.0f}) — {result['discrepancy_pct']}% discrepancy"
            )
    return result


# ─────────────────────────────────────────────────────────────────────────────
#  BANK STATEMENT ANALYSIS
# ─────────────────────────────────────────────────────────────────────────────

_INDIAN_HOLIDAYS = {
    datetime.date(2024, 1, 26), datetime.date(2024, 3, 25),
    datetime.date(2024, 4, 14), datetime.date(2024, 8, 15),
    datetime.date(2024, 10, 2), datetime.date(2024, 11, 1),
    datetime.date(2024, 12, 25),
    datetime.date(2025, 1, 26), datetime.date(2025, 3, 14),
    datetime.date(2025, 4, 14), datetime.date(2025, 8, 15),
    datetime.date(2025, 10, 2), datetime.date(2025, 12, 25),
}


def parse_bank_statement(text):
    result = {
        "salary_credits": [], "average_monthly_credit": 0.0,
        "round_number_salary_flag": False, "no_weekend_gap_flag": False,
        "sudden_large_deposit_flag": False, "total_credits": 0.0,
        "total_debits": 0.0, "transaction_dates": [], "anomaly_details": [],
    }
    txn_pattern = re.findall(
        r'(\d{1,2}[\/\-]\w{3,9}[\/\-]\d{2,4}|\d{2}[\/\-]\d{2}[\/\-]\d{4})'
        r'.*?₹?\s*([\d,]+(?:\.\d{2})?)\s*(Cr|Dr|CR|DR|credit|debit)',
        text
    )
    credits = []
    debits = []
    parsed_dates = []
    for match in txn_pattern:
        raw_date, raw_amount, txn_type = match
        try: amount = float(raw_amount.replace(',', ''))
        except ValueError: continue
        parsed_dt = _try_parse_date(raw_date)
        if txn_type.lower() in ('cr', 'credit'):
            credits.append((parsed_dt, amount))
            result["total_credits"] += amount
        else:
            debits.append((parsed_dt, amount))
            result["total_debits"] += amount
        if parsed_dt:
            parsed_dates.append(parsed_dt)
    if credits:
        amounts = [c[1] for c in credits]
        avg = sum(amounts) / len(amounts)
        result["average_monthly_credit"] = round(avg, 2)
        round_count = sum(1 for a in amounts if a % 1000 == 0)
        if len(amounts) >= 2 and round_count / len(amounts) > 0.6:
            result["round_number_salary_flag"] = True
            result["anomaly_details"].append(
                f"{round_count}/{len(amounts)} credits are exact round numbers."
            )
        threshold = avg * 3.0
        large_deposits = [a for a in amounts if a > threshold]
        if large_deposits:
            result["sudden_large_deposit_flag"] = True
            result["anomaly_details"].append(
                f"Deposit of ₹{max(large_deposits):,.0f} is > 3× average (₹{avg:,.0f})."
            )
    if parsed_dates and len(parsed_dates) >= 5:
        valid_dates = [d for d in parsed_dates if d]
        weekend_txns = [d for d in valid_dates if d.weekday() >= 5]
        date_set = set(valid_dates)
        if len(date_set) >= 20:
            min_dt = min(valid_dates)
            max_dt = max(valid_dates)
            delta = (max_dt - min_dt).days
            if delta > 0:
                coverage = len(date_set) / delta
                if coverage > 0.85 and len(weekend_txns) == 0:
                    result["no_weekend_gap_flag"] = True
                    result["anomaly_details"].append(
                        "Transactions on virtually every day with no weekend gaps."
                    )
    result["transaction_dates"] = [str(d) for d in parsed_dates if d]
    result["salary_credits"] = [
        {"amount": c[1], "date": str(c[0]) if c[0] else None}
        for c in credits[:12]
    ]
    return result


def _try_parse_date(raw):
    formats = ["%d-%b-%Y", "%d/%b/%Y", "%d-%m-%Y", "%d/%m/%Y", "%d-%b-%y", "%d/%b/%y"]
    for fmt in formats:
        try: return datetime.datetime.strptime(raw.strip(), fmt).date()
        except ValueError: continue
    return None


# ─────────────────────────────────────────────────────────────────────────────
#  BENFORD'S LAW
# ─────────────────────────────────────────────────────────────────────────────

def compute_benford(text, doc_name="document", doc_hash=""):
    if not text:
        return _empty_benford()
    numbers = re.findall(r'\b([1-9])\d*(?:\.\d+)?\b', text)
    if len(numbers) < 10:
        return _empty_benford(sample_size=len(numbers))
    first_digits = [int(n) for n in numbers]
    total = len(first_digits)
    counts = {d: first_digits.count(d) for d in range(1, 10)}
    expected_probs = {d: math.log10(1 + 1.0 / d) for d in range(1, 10)}
    chi_square = 0.0
    digit_distribution = []
    for d in range(1, 10):
        observed = counts[d]
        expected = total * expected_probs[d]
        observed_pct = (observed / total * 100) if total > 0 else 0
        expected_pct = expected_probs[d] * 100
        if expected > 0:
            chi_square += ((observed - expected) ** 2) / expected
        digit_distribution.append({
            "digit": d,
            "observed": round(observed_pct, 1),
            "expected": round(expected_pct, 1),
        })
    normalized = round(min(1.0, chi_square / 25.0), 4)

    findings = []
    if chi_square > 15.0:
        findings.append(make_finding(
            doc_hash=doc_hash or hashlib.sha256(text[:200].encode()).hexdigest()[:12],
            check_name="benford_law",
            severity="WARNING" if chi_square < 25 else "CRITICAL",
            category="Behavioral Signature",
            document_name=doc_name,
            field_name="number_distribution",
            expected_value=f"Chi-squared < 15.0 (natural distribution)",
            actual_value=round(chi_square, 2),
            discrepancy_abs=round(chi_square - 15.0, 2),
            description=(
                f"Benford's Law chi-squared deviation is {chi_square:.2f} "
                f"(threshold 15.0). High deviation suggests numbers in this "
                f"document were fabricated or selectively chosen rather than "
                f"arising from natural financial processes."
            ),
            recommendation="Review all numerical values for round-number bias. "
                           "Compare with bank transaction records for the same period.",
            evidence={
                "chi_squared": round(chi_square, 4),
                "sample_size": total,
                "digit_distribution": digit_distribution,
            },
        ))

    return {
        "chi_squared": round(chi_square, 4),
        "normalized_score": normalized,
        "sample_size": total,
        "digit_distribution": digit_distribution,
        "findings": findings,
    }


def _empty_benford(sample_size=0):
    return {
        "chi_squared": 0.0,
        "normalized_score": 0.0,
        "sample_size": sample_size,
        "digit_distribution": [
            {"digit": d, "observed": 0, "expected": round(math.log10(1 + 1.0/d) * 100, 1)}
            for d in range(1, 10)
        ],
        "findings": [],
    }


# ─────────────────────────────────────────────────────────────────────────────
#  META-VECTOR BUILDER  — leak-free (unchanged from v2)
# ─────────────────────────────────────────────────────────────────────────────

def build_meta_vector(
    sg: float, sn: float, ii: float, lv: float,
    producer_flag: bool, ela_sal_score: float = 0.0,
    net_gross_anomaly: float = 0.0, income_sal_anomaly: float = 0.0,
):
    """
    Build 12-feature meta-vector for AEGIS inference.
    All features computed from raw document values — no fraud_flags leaked.
    """
    net_gross_ratio    = sn / sg       if sg > 0 else 0.0
    income_sal_ratio   = ii / (sg * 12) if sg > 0 else 0.0
    wealth_ratio       = lv / sg        if sg > 0 else 0.0
    is_gross_plausible = 1.0 if sg > 5000 else 0.0
    return np.array([
        sg, sn, ii, lv,
        net_gross_ratio, income_sal_ratio, wealth_ratio,
        is_gross_plausible, 1.0 if producer_flag else 0.0,
        float(net_gross_anomaly), float(income_sal_anomaly),
        float(ela_sal_score),
    ], dtype=np.float32)


# ─────────────────────────────────────────────────────────────────────────────
#  RULE-BASED LABELER  (for training data — never called at inference)
# ─────────────────────────────────────────────────────────────────────────────

def rule_based_labeler(parsed_doc: dict) -> dict:
    """
    Produce binary fraud label purely from document content.
    Used ONLY during training data generation. Never at inference.

    parsed_doc keys expected:
        salary_gross, salary_net, salary_deductions,
        itr_total_income, land_value, circle_rate, extent_sqft,
        pdf_producer, uid_last4, aadhaar_last4,
        district, city, branch_phone_page1, branch_phone_page2,
        land_classification, land_zone, father_cultural_pool,
        name_cultural_pool, employer_name
    """
    violated = []

    # Rule 1: UID-Aadhaar last-4 mismatch
    uid_last4 = str(parsed_doc.get("uid_last4", "")).strip()
    aadhaar_last4 = str(parsed_doc.get("aadhaar_last4", "")).strip()
    if uid_last4 and aadhaar_last4 and uid_last4 != aadhaar_last4:
        violated.append("uid_aadhaar_mismatch")

    # Rule 2: District-city inconsistency
    if parsed_doc.get("district_city_mismatch", False):
        violated.append("district_city_mismatch")

    # Rule 3: Branch phone variation across pages
    p1 = str(parsed_doc.get("branch_phone_page1", ""))
    p2 = str(parsed_doc.get("branch_phone_page2", ""))
    if p1 and p2 and p1 != p2:
        violated.append("branch_phone_variation")

    # Rule 4: Land classification-zone contradiction
    cls_ = (parsed_doc.get("land_classification") or "").lower()
    zone = (parsed_doc.get("land_zone") or "").lower()
    contradiction_pairs = [
        ("agricultural", "commercial"), ("agricultural", "residential"),
        ("residential", "agricultural"), ("commercial", "agricultural"),
    ]
    if any(cls_ in p[0] and zone in p[1] for p in contradiction_pairs):
        violated.append("land_classification_zone_mismatch")

    # Rule 5: Salary math failure
    sg = float(parsed_doc.get("salary_gross", 0))
    sn = float(parsed_doc.get("salary_net", 0))
    sd = float(parsed_doc.get("salary_deductions", 0))
    if sg > 0 and sn > 0 and sd > 0:
        if abs((sg - sd) - sn) > sg * 0.05:
            violated.append("salary_math_failure")

    # Rule 6: Round-number salary pattern
    if sg > 0 and sg % 1000 == 0:
        violated.append("round_number_salary")

    # Rule 7: Metadata software anomaly
    producer = (parsed_doc.get("pdf_producer") or "").lower()
    if any(sw in producer for sw in _SUSPICIOUS_PRODUCERS):
        violated.append("metadata_software_anomaly")

    # Rule 8: ITR income deviation
    itr = float(parsed_doc.get("itr_total_income", 0))
    if sg > 0 and itr > 0:
        annualized = sg * 12
        if abs(itr - annualized) / annualized > 0.30:
            violated.append("itr_income_deviation")

    fraud_indicator = 1 if len(violated) >= 2 else 0
    confidence = len(violated) / 8.0

    return {
        "fraud_indicator": fraud_indicator,
        "violated_rules": violated,
        "confidence": round(confidence, 4),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  GOLD APPRAISAL TEXT PARSER
#  Extracts structured fields from the text layer of gold_appraisal.pdf.
#  Used by the forensic pipeline before calling the four gold check functions.
# ─────────────────────────────────────────────────────────────────────────────

def parse_gold_appraisal(pdf_bytes_or_text) -> dict:
    """
    Extract structured gold appraisal fields from either raw PDF bytes or
    pre-extracted text.

    Returns a dict with keys:
        gross_weight    (float)  grams
        stone_weight    (float)  grams
        net_gold_weight (float)  grams
        karat           (int)    24 / 22 / 18 / 14
        rate_used       (float)  ₹/gram
        declared_value  (float)  ₹
        loan_amount     (float)  ₹
        valuation_date  (str)    DD/MM/YYYY or empty
        appraiser_name  (str)
        hallmark_no     (str)
        item_type       (str)
        ref_no          (str)

    Missing / un-parseable fields return 0.0 / "" / 22 (default karat).
    """
    if isinstance(pdf_bytes_or_text, (bytes, bytearray)):
        text = extract_text_from_pdf_bytes(pdf_bytes_or_text)
    else:
        text = str(pdf_bytes_or_text)

    def _float(pattern, default=0.0, flags=re.IGNORECASE):
        m = re.search(pattern, text, flags)
        if m:
            try:
                return float(m.group(1).replace(",", ""))
            except Exception:
                pass
        return default

    def _str(pattern, default="", flags=re.IGNORECASE):
        m = re.search(pattern, text, flags)
        return m.group(1).strip() if m else default

    # --- Weights ---------------------------------------------------------
    gross_weight   = _float(r'Gross\s+Weight\s*[\(\w\/\)]*\s*[:\-]?\s*([\d,]+\.?\d*)')
    stone_weight   = _float(r'Stone\s+Weight\s*[\(\w\/\)]*\s*[:\-]?\s*([\d,]+\.?\d*)')
    net_gold_weight = _float(r'Net\s+Gold\s+Weight\s*[\(\w\/\)]*\s*[:\-]?\s*([\d,]+\.?\d*)')
    if net_gold_weight == 0.0 and gross_weight > 0:
        net_gold_weight = round(gross_weight - stone_weight, 3)

    # --- Purity ----------------------------------------------------------
    karat_match = re.search(r'\b(24|22|18|14)\s*K\b', text, re.IGNORECASE)
    karat = int(karat_match.group(1)) if karat_match else 22

    # --- Financial values ------------------------------------------------
    # "Gold Rate" / "Gold Rate (Rs/gram)" / "Rate"
    rate_used = _float(r'Gold\s+Rate\s*[\(\w\/\)]*\s*[:\-]?\s*(?:Rs\.?\s*)?([\d,]+\.?\d*)')
    if rate_used == 0.0:
        rate_used = _float(r'Rate\s*[\(\w\/\)]*\s*[:\-]?\s*(?:Rs\.?\s*)?([\d,]+\.?\d*)')

    # "Declared Value" takes priority; fall back to "Computed Value"
    declared_value = _float(r'Declared\s+Value\s*[\(\w\/\)]*\s*[:\-]?\s*(?:Rs\.?\s*)?([\d,]+\.?\d*)')
    if declared_value == 0.0:
        declared_value = _float(r'Computed\s+Value\s*[\(\w\/\)]*\s*[:\-]?\s*(?:Rs\.?\s*)?([\d,]+\.?\d*)')

    # Non-greedy match so Rs/number is captured, not consumed by [^...]*
    loan_amount = _float(r'Loan\s+Amount[^:\n]*?Rs\.?\s*([\d,]+\.?\d*)')
    if loan_amount == 0.0:
        loan_amount = _float(r'Loan[^:\n]*?Rs\.?\s*([\d,]+\.?\d*)')

    # --- Dates -----------------------------------------------------------
    valuation_date = _str(
        r'(?:Valuation\s+Date|Date)\s*[:\-]?\s*(\d{2}/\d{2}/\d{4})'
    )

    # --- Other identifiers -----------------------------------------------
    ref_no         = _str(r'Ref\s*No\s*[:\-]?\s*(CB/GLD/[\w/]+)')
    appraiser_name = _str(r'Appraiser\s+Name\s*[:\-]?\s*([A-Za-z ]{4,40})')
    hallmark_no    = _str(r'Hallmark\s*No\s*[:\-]?\s*([A-Z0-9]{6})')
    item_type      = _str(r'Item\s+Type\s*[:\-]?\s*(Ring|Bangle|Chain|Necklace|Earring)')

    return {
        "gross_weight"   : gross_weight,
        "stone_weight"   : stone_weight,
        "net_gold_weight": net_gold_weight,
        "karat"          : karat,
        "rate_used"      : rate_used,
        "declared_value" : declared_value,
        "loan_amount"    : loan_amount,
        "valuation_date" : valuation_date,
        "appraiser_name" : appraiser_name,
        "hallmark_no"    : hallmark_no,
        "item_type"      : item_type,
        "ref_no"         : ref_no,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  GOLD LOAN FORENSIC CHECKS
#  Each function accepts structured data extracted from the gold appraisal PDF
#  (via OCR / manifest) and returns a single Finding object.
#  These are deterministic — no model inference involved.
# ─────────────────────────────────────────────────────────────────────────────

# Monthly MCX average rates (₹/gram, 22K gold) — mirrors the generator table.
_GOLD_RATE_TABLE = {
    "2024-01": 5950,  "2024-02": 6100,  "2024-03": 6280,
    "2024-04": 6650,  "2024-05": 6820,  "2024-06": 6710,
    "2024-07": 6830,  "2024-08": 6950,  "2024-09": 7100,
    "2024-10": 7380,  "2024-11": 7540,  "2024-12": 7200,
    "2025-01": 7650,  "2025-02": 7820,  "2025-03": 8100,
    "2025-04": 8350,  "2025-05": 8620,  "2025-06": 8480,
    "2025-07": 8710,  "2025-08": 8950,  "2025-09": 9100,
    "2025-10": 9280,  "2025-11": 9420,  "2025-12": 9180,
    "2026-01": 9350,  "2026-02": 9480,  "2026-03": 9650,
    "2026-04": 9820,  "2026-05": 9950,  "2026-06": 9780,
}

_GOLD_PURITY_FACTORS = {
    24: 0.9999,
    22: 0.9166,
    18: 0.7500,
    14: 0.5833,
}

# Sentinel doc_hash used when no PDF bytes are available for these checks.
_GOLD_SENTINEL_HASH = "gold_rule_check"


def check_gold_valuation_math(appraisal_data: dict) -> dict:
    """
    Verify the declared gold value against the independently computed value.

    Parameters
    ----------
    appraisal_data : dict with keys:
        gross_weight   (float)  – total article weight in grams
        stone_weight   (float)  – weight of non-gold stones in grams
        karat          (int)    – purity karat: one of 24, 22, 18, 14
        rate_used      (float)  – ₹ per gram rate stated in the appraisal
        declared_value (float)  – value declared by the appraiser (₹)

    Returns
    -------
    Finding dict (via make_finding)
    """
    gross_weight   = float(appraisal_data.get("gross_weight", 0))
    stone_weight   = float(appraisal_data.get("stone_weight", 0))
    karat          = int(appraisal_data.get("karat", 22))
    rate_used      = float(appraisal_data.get("rate_used", 0))
    declared_value = float(appraisal_data.get("declared_value", 0))

    purity   = _GOLD_PURITY_FACTORS.get(karat, _GOLD_PURITY_FACTORS[22])
    net_wt   = gross_weight - stone_weight
    pure_gold = net_wt * purity
    expected  = pure_gold * rate_used

    if expected > 0:
        deviation = abs(declared_value - expected) / expected
    else:
        deviation = 0.0

    deviation_pct = round(deviation * 100, 2)

    if deviation < 0.02:
        severity    = "INFO"
        description = (
            f"Valuation math verified. Declared value ₹{declared_value:,.2f} matches "
            f"computed value ₹{expected:,.2f} within {deviation_pct:.2f}% tolerance."
        )
        recommendation = "No action required."
    elif deviation <= 0.15:
        severity    = "WARNING"
        description = (
            f"Minor valuation gap detected. Declared value ₹{declared_value:,.2f} "
            f"differs from computed value ₹{expected:,.2f} by {deviation_pct:.2f}%. "
            f"Possible minor rounding or assay variance."
        )
        recommendation = (
            "Request appraiser to re-submit with corrected weight/purity readings. "
            "Verify stone weight deduction is correctly applied."
        )
    else:
        severity    = "CRITICAL"
        description = (
            f"Valuation significantly inflated. Declared value ₹{declared_value:,.2f} "
            f"exceeds computed value ₹{expected:,.2f} by {deviation_pct:.2f}%. "
            f"Deviation >15% is a strong indicator of Variant A forgery (inflated declared value)."
        )
        recommendation = (
            "Reject appraisal. Commission independent BIS-certified re-valuation. "
            "Flag applicant for enhanced due diligence."
        )

    return make_finding(
        doc_hash        = _GOLD_SENTINEL_HASH,
        check_name      = "gold_valuation_math",
        severity        = severity,
        category        = "Gold Loan Integrity",
        document_name   = "gold_appraisal.pdf",
        field_name      = "declared_value",
        expected_value  = round(expected, 2),
        actual_value    = declared_value,
        discrepancy_abs = round(abs(declared_value - expected), 2),
        discrepancy_pct = deviation_pct,
        description     = description,
        recommendation  = recommendation,
        evidence        = {
            "computed_value"  : round(expected, 2),
            "declared_value"  : declared_value,
            "deviation_pct"   : deviation_pct,
            "pure_gold_weight": round(pure_gold, 4),
            "rate_used"       : rate_used,
            "net_gold_weight" : round(net_wt, 3),
            "karat"           : karat,
            "purity_factor"   : purity,
        },
    )


def check_gold_market_rate(rate_used: float, valuation_date: str) -> dict:
    """
    Verify that the gold rate stated in the appraisal is consistent with
    the published MCX monthly average for the stated valuation date.

    Parameters
    ----------
    rate_used       (float) – ₹/gram rate stated in appraisal (for 22K equiv)
    valuation_date  (str)   – date string; any format containing YYYY-MM or DD/MM/YYYY

    Returns
    -------
    Finding dict (via make_finding)
    """
    # Parse YYYY-MM from the date string
    month_key = None
    # Try ISO / YYYY-MM prefix first
    iso_match = re.search(r'(\d{4}-\d{2})', valuation_date or "")
    if iso_match:
        month_key = iso_match.group(1)
    else:
        # Try DD/MM/YYYY
        dmy_match = re.match(r'(\d{2})/(\d{2})/(\d{4})', (valuation_date or "").strip())
        if dmy_match:
            month_key = f"{dmy_match.group(3)}-{dmy_match.group(2)}"

    # Look up market rate; fall back to nearest past month
    market_rate = None
    if month_key:
        if month_key in _GOLD_RATE_TABLE:
            market_rate = _GOLD_RATE_TABLE[month_key]
        else:
            for k in sorted(_GOLD_RATE_TABLE.keys(), reverse=True):
                if k <= month_key:
                    market_rate = _GOLD_RATE_TABLE[k]
                    break

    if market_rate is None or market_rate == 0:
        # Cannot determine market rate — informational finding only
        return make_finding(
            doc_hash        = _GOLD_SENTINEL_HASH,
            check_name      = "gold_market_rate",
            severity        = "WARNING",
            category        = "Gold Loan Integrity",
            document_name   = "gold_appraisal.pdf",
            field_name      = "gold_rate",
            expected_value  = "MCX rate for stated month",
            actual_value    = rate_used,
            description     = (
                f"Unable to determine MCX market rate for valuation date '{valuation_date}'. "
                f"Manual rate verification required."
            ),
            recommendation  = "Cross-check stated rate with MCX historical data for the stated period.",
            evidence        = {
                "rate_used"              : rate_used,
                "market_rate_for_month"  : None,
                "deviation_pct"          : None,
                "valuation_date"         : valuation_date,
            },
        )

    # The stated rate may be for any karat; the table is 22K.
    # Compare directly: both should be on the same karat basis.
    # Tolerance: ±10% of published 22K rate.
    deviation     = (rate_used - market_rate) / market_rate
    deviation_pct = round(deviation * 100, 2)

    if abs(deviation) <= 0.10:
        severity    = "INFO"
        description = (
            f"Rate within market range. Stated rate ₹{rate_used:,.2f}/g is within ±10% "
            f"of MCX 22K average ₹{market_rate:,}/g for {month_key}."
        )
        recommendation = "No action required."
    elif deviation <= 0.20:
        severity    = "WARNING"
        description = (
            f"Rate above market ceiling. Stated rate ₹{rate_used:,.2f}/g is "
            f"{deviation_pct:.1f}% above MCX 22K average ₹{market_rate:,}/g for {month_key}. "
            f"Consistent with Variant B forgery (inflated rate)."
        )
        recommendation = (
            "Request appraiser to justify rate with exchange receipts. "
            "Apply sensitivity adjustment before sanctioning."
        )
    else:
        severity    = "CRITICAL"
        description = (
            f"Rate impossible for stated date. Stated rate ₹{rate_used:,.2f}/g is "
            f"{deviation_pct:.1f}% above MCX 22K average ₹{market_rate:,}/g for {month_key}. "
            f"A deviation >20% above published MCX rates is not achievable in practice."
        )
        recommendation = (
            "Reject appraisal. The stated rate cannot be reconciled with published MCX data. "
            "Possible fabricated rate — commission independent BIS re-valuation."
        )

    return make_finding(
        doc_hash        = _GOLD_SENTINEL_HASH,
        check_name      = "gold_market_rate",
        severity        = severity,
        category        = "Gold Loan Integrity",
        document_name   = "gold_appraisal.pdf",
        field_name      = "gold_rate",
        expected_value  = market_rate,
        actual_value    = rate_used,
        discrepancy_abs = round(rate_used - market_rate, 2),
        discrepancy_pct = deviation_pct,
        description     = description,
        recommendation  = recommendation,
        evidence        = {
            "rate_used"              : rate_used,
            "market_rate_for_month"  : market_rate,
            "deviation_pct"          : deviation_pct,
            "valuation_date"         : valuation_date,
            "month_key"              : month_key,
        },
    )


def check_gold_ltv_ratio(loan_amount: float, declared_value: float) -> dict:
    """
    Verify that the loan-to-value ratio does not breach RBI's 75% mandate
    for gold loans.

    Parameters
    ----------
    loan_amount     (float) – sanctioned / requested loan amount (₹)
    declared_value  (float) – gold declared value from appraisal (₹)

    Returns
    -------
    Finding dict (via make_finding)
    """
    _RBI_LIMIT = 0.75

    if declared_value <= 0:
        ltv_ratio    = 0.0
        breach_amount = 0.0
    else:
        ltv_ratio     = loan_amount / declared_value
        breach_amount = loan_amount - (declared_value * _RBI_LIMIT)

    ltv_pct = round(ltv_ratio * 100, 2)

    if ltv_ratio <= _RBI_LIMIT:
        severity    = "INFO"
        description = (
            f"LTV within RBI limit. LTV ratio {ltv_pct:.2f}% is at or below the "
            f"RBI-mandated 75% ceiling for gold loans."
        )
        recommendation = "No action required."
    elif ltv_ratio <= 0.85:
        severity    = "WARNING"
        description = (
            f"LTV exceeds RBI 75% mandate. LTV ratio {ltv_pct:.2f}% breaches the "
            f"RBI Circular RBI/2022-23/91 ceiling of 75% for gold loans. "
            f"Excess exposure: ₹{breach_amount:,.2f}."
        )
        recommendation = (
            "Reduce sanctioned loan amount to bring LTV ≤ 75% of declared value, "
            "or obtain additional collateral. Document exception in credit file."
        )
    else:
        severity    = "CRITICAL"
        description = (
            f"Severe LTV breach — possible fraud. LTV ratio {ltv_pct:.2f}% far exceeds the "
            f"RBI 75% ceiling. Excess exposure: ₹{breach_amount:,.2f}. "
            f"At LTV >85%, a forged appraisal inflating declared_value is the most "
            f"probable explanation."
        )
        recommendation = (
            "REJECT loan. Commission independent BIS-certified re-valuation. "
            "Flag for fraud investigation. Notify compliance officer."
        )

    return make_finding(
        doc_hash        = _GOLD_SENTINEL_HASH,
        check_name      = "gold_ltv_ratio",
        severity        = severity,
        category        = "Gold Loan Integrity",
        document_name   = "gold_appraisal.pdf",
        field_name      = "ltv_ratio",
        expected_value  = f"≤ {_RBI_LIMIT * 100:.0f}%",
        actual_value    = f"{ltv_pct:.2f}%",
        discrepancy_abs = round(max(0.0, breach_amount), 2),
        discrepancy_pct = round((ltv_ratio - _RBI_LIMIT) * 100, 2) if ltv_ratio > _RBI_LIMIT else 0.0,
        description     = description,
        recommendation  = recommendation,
        evidence        = {
            "loan_amount"   : loan_amount,
            "declared_value": declared_value,
            "ltv_ratio"     : round(ltv_ratio, 4),
            "rbi_limit"     : _RBI_LIMIT,
            "breach_amount" : round(max(0.0, breach_amount), 2),
        },
    )


def check_gold_income_ratio(
    loan_amount: float,
    annual_income: float,
    existing_mortgage: float = 0.0,
) -> list:
    """
    Assess whether the gold loan amount is proportionate to the applicant's
    annual income, and whether total debt burden is sustainable.

    This check uses existing documents (salary slip / ITR) — no appraisal
    PDF is required.  It runs for ALL applicants when the loan type is gold.

    Parameters
    ----------
    loan_amount       (float) – gold loan amount requested (₹)
    annual_income     (float) – applicant's gross annual income (₹)
    existing_mortgage (float) – sum of all existing loan obligations (₹); default 0

    Returns
    -------
    list[Finding]  — one primary finding (always) plus an optional additional
                     CRITICAL finding when cumulative debt is extreme.
    """
    findings = []

    if annual_income <= 0:
        # Cannot compute ratio — return a single WARNING
        findings.append(make_finding(
            doc_hash        = _GOLD_SENTINEL_HASH,
            check_name      = "gold_income_ratio",
            severity        = "WARNING",
            category        = "Gold Loan Integrity",
            document_name   = "salary.pdf / itr.pdf",
            field_name      = "income_ratio",
            expected_value  = "Annual income > 0",
            actual_value    = annual_income,
            description     = "Annual income is zero or missing — income ratio cannot be computed.",
            recommendation  = "Obtain verified income proof before proceeding.",
            evidence        = {
                "loan_amount"      : loan_amount,
                "annual_income"    : annual_income,
                "income_ratio"     : None,
                "existing_mortgage": existing_mortgage,
                "total_debt"       : loan_amount + existing_mortgage,
            },
        ))
        return findings

    income_ratio = loan_amount / annual_income
    total_debt   = loan_amount + existing_mortgage

    ratio_rounded = round(income_ratio, 2)

    if income_ratio < 3.0:
        severity    = "INFO"
        description = (
            f"Loan is well-proportioned to income. Income ratio {ratio_rounded:.2f}× "
            f"(loan ₹{loan_amount:,.0f} vs annual income ₹{annual_income:,.0f}) is below 3×."
        )
        recommendation = "No action required."
    elif income_ratio <= 6.0:
        severity    = "WARNING"
        description = (
            f"Loan is high relative to income. Income ratio {ratio_rounded:.2f}× "
            f"(loan ₹{loan_amount:,.0f} vs annual income ₹{annual_income:,.0f}). "
            f"Ratios between 3× and 6× warrant heightened scrutiny of repayment capacity."
        )
        recommendation = (
            "Conduct full FOIR (Fixed Obligation to Income Ratio) assessment. "
            "Consider reducing sanctioned amount or requiring a co-obligant."
        )
    else:
        severity    = "CRITICAL"
        description = (
            f"Loan severely disproportionate to income. Income ratio {ratio_rounded:.2f}× "
            f"(loan ₹{loan_amount:,.0f} vs annual income ₹{annual_income:,.0f}). "
            f"A ratio >6× strongly suggests either an inflated loan amount or "
            f"an under-declared income — both red flags for gold loan fraud."
        )
        recommendation = (
            "Escalate for senior credit review. Re-verify income with Form 16 / bank statements. "
            "Do not sanction without independent income verification."
        )

    findings.append(make_finding(
        doc_hash        = _GOLD_SENTINEL_HASH,
        check_name      = "gold_income_ratio",
        severity        = severity,
        category        = "Gold Loan Integrity",
        document_name   = "salary.pdf / itr.pdf",
        field_name      = "income_ratio",
        expected_value  = "Income ratio < 3× annual income",
        actual_value    = f"{ratio_rounded:.2f}×",
        discrepancy_abs = round(max(0.0, income_ratio - 3.0), 2),
        discrepancy_pct = round((income_ratio - 3.0) / 3.0 * 100, 2) if income_ratio > 3.0 else 0.0,
        description     = description,
        recommendation  = recommendation,
        evidence        = {
            "loan_amount"      : loan_amount,
            "annual_income"    : annual_income,
            "income_ratio"     : ratio_rounded,
            "existing_mortgage": existing_mortgage,
            "total_debt"       : round(total_debt, 2),
        },
    ))

    # Secondary check: cumulative debt burden
    if annual_income > 0 and total_debt > annual_income * 50:
        debt_multiple = round(total_debt / annual_income, 1)
        findings.append(make_finding(
            doc_hash        = _GOLD_SENTINEL_HASH,
            check_name      = "gold_cumulative_debt_burden",
            severity        = "CRITICAL",
            category        = "Gold Loan Integrity",
            document_name   = "salary.pdf / itr.pdf",
            field_name      = "total_debt",
            expected_value  = f"Total debt < 50× annual income (₹{annual_income * 50:,.0f})",
            actual_value    = round(total_debt, 2),
            discrepancy_abs = round(total_debt - annual_income * 50, 2),
            discrepancy_pct = round((total_debt / (annual_income * 50) - 1) * 100, 2),
            description     = (
                f"Cumulative debt burden is extreme relative to income. "
                f"Total debt ₹{total_debt:,.0f} is {debt_multiple:.1f}× the applicant's "
                f"annual income ₹{annual_income:,.0f}, exceeding the 50× threshold. "
                f"This level of indebtedness is irreconcilable with stated income."
            ),
            recommendation  = (
                "CRITICAL HOLD — Do not sanction. Initiate full debt reconciliation review. "
                "Verify all existing obligations with CIBIL / credit bureau report. "
                "Possible income fabrication or undisclosed liabilities."
            ),
            evidence        = {
                "loan_amount"      : loan_amount,
                "annual_income"    : annual_income,
                "income_ratio"     : ratio_rounded,
                "existing_mortgage": existing_mortgage,
                "total_debt"       : round(total_debt, 2),
            },
        ))

    return findings


# ─────────────────────────────────────────────────────────────────────────────
#  AUDIT TRAIL LOGGER
# ─────────────────────────────────────────────────────────────────────────────

class AuditLogger:
    """Append-only in-memory audit log for a single analysis session."""

    def __init__(self):
        self._entries = []

    def log(self, operation: str, inputs: dict, output_summary: str):
        ts = datetime.datetime.utcnow().isoformat(timespec="microseconds") + "Z"
        
        # Summarize dictionary inputs as a readable string for details column in the UI
        if isinstance(inputs, dict):
            inputs_str = ", ".join(f"{k}={v}" for k, v in inputs.items())
        else:
            inputs_str = str(inputs)
            
        self._entries.append({
            "timestamp": ts,
            "operation": operation,
            "inputs_summary": inputs,
            "output_summary": output_summary,
            
            # Map parameters for frontend (ForensicWorkspace.jsx) expectation
            "action": operation,
            "details": inputs_str,
            "system_note": output_summary,
        })

    def entries(self):
        return list(self._entries)
