"""
=============================================================================
AEGIS GOLD APPRAISAL GENERATOR  v1.0
Senior Lead Architect: Document Forensics & AI Data Engineering
-----------------------------------------------------------------------------
Generates synthetic gold_appraisal.pdf documents for the Canara Bank
fraud-detection dataset.  One page per applicant.

  - 50 genuine (added to safe/applicant_0001 ... applicant_0050)
  - 50 forged  (added to risked/applicant_0001 ... applicant_0050)

For each applicant the generator:
  1. Loads the existing manifest.json
  2. Renders gold_appraisal.pdf into the same folder
  3. Updates manifest.json with the pdf path + gold fields
  4. Re-saves the dataset_index.json with the new fields

Forged variants (any one picked randomly):
  A - Inflate declared value 15-45% over computed
  B - Use gold rate 20-35% above market rate for that month
  C - Overstate gross weight by 15-30%
  D - Claim 22K purity but use 18K purity factor

Gold-rate lookup table: monthly MCX averages (Rs/gram, 22K)
=============================================================================
"""

import os, json, math, random, string
from datetime import date, timedelta
from pathlib import Path
from io import BytesIO

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, Color, black, white
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader

from PIL import Image, ImageDraw, ImageFont
import qrcode

# ============================================================================
#  CONSTANTS
# ============================================================================
PAGE_W, PAGE_H = A4
MARGIN         = 18 * mm
CANARA_BLUE    = HexColor("#003F87")
CANARA_GOLD    = HexColor("#B8860B")
CANARA_LIGHT   = HexColor("#E8F0F8")
CANARA_RED     = HexColor("#C0392B")
STRIPE_GREY    = HexColor("#F5F5F5")
TEXT_DARK      = HexColor("#1A1A1A")
TEXT_MED       = HexColor("#444444")
TEXT_LIGHT     = HexColor("#888888")

# ============================================================================
#  GOLD RATE LOOKUP TABLE
# ============================================================================
GOLD_RATES_22K = {
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

PURITY_FACTOR = {
    "24K": 0.9999,
    "22K": 0.9166,
    "18K": 0.7500,
    "14K": 0.5833,
}

ITEM_TYPES = ["Ring", "Bangle", "Chain", "Necklace", "Earring"]

SOUTH_INDIAN_MALE_FIRST = [
    "Venkatesan", "Subramaniam", "Narayanan", "Murugesan", "Krishnamurthy",
    "Raghavendra", "Annamalai", "Thiruvengadam", "Palaniswamy", "Shanmugam",
    "Sundaresan", "Balakrishnan", "Ramachandran", "Sathyanarayana", "Govindaswamy",
    "Thangavelu", "Kandasamy", "Periyasamy", "Selvam", "Ravi",
    "Veerappan", "Chellapandian", "Arumugam", "Velusamy", "Kumarasamy",
]
SOUTH_INDIAN_FEMALE_FIRST = [
    "Meenakshi", "Lakshmi", "Saraswathi", "Padmavathi", "Kamakshi",
    "Rajalakshmi", "Vijayalakshmi", "Karpagam", "Jayamala", "Sumathi",
    "Nirmala", "Kamala", "Savithri", "Geetha", "Revathi",
    "Thilagavathi", "Annapoorna", "Seethalakshmi", "Madhavi", "Bhavani",
]
SOUTH_INDIAN_SURNAMES = [
    "Pillai", "Nair", "Menon", "Iyer", "Iyengar",
    "Krishnamurthy", "Subramanian", "Venkataraman", "Balasubramanian",
    "Murugan", "Shankar", "Rajan", "Gopal", "Swamy",
    "Naidu", "Reddy", "Rao", "Gowda", "Shetty",
    "Kamath", "Nayak", "Pai", "Bhat", "Hegde",
]
STATE_CODES = ["KA", "TN", "KL", "AP", "TS", "MH", "GJ"]

BRANCH_REGISTRY = {
    "CNRB0001234": {"name": "Jayanagar 4th Block", "pin": "560041",
                    "phone": "080-26532241", "email": "cnrb0001234@canarabank.com"},
    "CNRB0002345": {"name": "Malleswaram", "pin": "560003",
                    "phone": "080-23461890", "email": "cnrb0002345@canarabank.com"},
    "CNRB0003456": {"name": "Indiranagar", "pin": "560038",
                    "phone": "080-25200145", "email": "cnrb0003456@canarabank.com"},
    "CNRB0004567": {"name": "Koramangala", "pin": "560034",
                    "phone": "080-25502781", "email": "cnrb0004567@canarabank.com"},
    "CNRB0005678": {"name": "Rajajinagar", "pin": "560010",
                    "phone": "080-23391020", "email": "cnrb0005678@canarabank.com"},
}

# ============================================================================
#  HELPERS
# ============================================================================

def rand_south_indian_name():
    gender = random.choice(["M", "F"])
    first  = random.choice(SOUTH_INDIAN_MALE_FIRST if gender == "M"
                           else SOUTH_INDIAN_FEMALE_FIRST)
    return f"{first} {random.choice(SOUTH_INDIAN_SURNAMES)}"

def rand_hallmark():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))

def rand_6digits():
    return "".join(random.choices("0123456789", k=6))

def get_gold_rate(val_date):
    key = val_date.strftime("%Y-%m")
    if key in GOLD_RATES_22K:
        return GOLD_RATES_22K[key]
    for k in sorted(GOLD_RATES_22K.keys(), reverse=True):
        if k <= key:
            return GOLD_RATES_22K[k]
    return list(GOLD_RATES_22K.values())[0]

def make_qr_image(data, size=80):
    qr = qrcode.QRCode(version=2, error_correction=qrcode.constants.ERROR_CORRECT_M,
                       box_size=3, border=1)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    img = img.resize((size, size), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf

def make_bank_seal(size=110):
    sz  = size * 3
    img = Image.new("RGBA", (sz, sz), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    c = sz // 2
    r_outer = c - 4
    draw.ellipse([4, 4, sz-4, sz-4], outline=(0, 63, 135, 220), width=6)
    draw.ellipse([18, 18, sz-18, sz-18], outline=(0, 63, 135, 200), width=3)
    draw.ellipse([20, 20, sz-20, sz-20], fill=(0, 63, 135, 40))
    try:
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
        font_lg = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
    except Exception:
        font_sm = ImageFont.load_default()
        font_lg = font_sm
    arc_text = "  CANARA BANK  "
    for i, ch in enumerate(arc_text):
        angle = -90 + (i - len(arc_text)/2) * (180 / max(len(arc_text), 1))
        rad = math.radians(angle)
        tx = c + int((r_outer - 12) * math.cos(rad)) - 6
        ty = c + int((r_outer - 12) * math.sin(rad)) - 11
        draw.text((tx, ty), ch, font=font_sm, fill=(0, 63, 135, 230))
    draw.text((c - 38, c - 24), "OFFICIAL", font=font_lg, fill=(0, 63, 135, 200))
    draw.text((c - 26, c + 2),  "SEAL",     font=font_lg, fill=(0, 63, 135, 200))
    bot_text = "AUTHORIZED SIGNATORY"
    for i, ch in enumerate(bot_text):
        angle = 90 + (i - len(bot_text)/2) * (160 / max(len(bot_text), 1))
        rad = math.radians(angle)
        tx = c + int((r_outer - 12) * math.cos(rad)) - 6
        ty = c + int((r_outer - 12) * math.sin(rad)) - 11
        draw.text((tx, ty), ch, font=font_sm, fill=(0, 63, 135, 220))
    img = img.resize((size, size), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf

# ============================================================================
#  DATA GENERATOR
# ============================================================================

def generate_gold_appraisal_data(applicant_id, application_date_str,
                                  branch_ifsc, is_forged):
    try:
        d, m, y = map(int, application_date_str.split("/"))
        app_date = date(y, m, d)
    except Exception:
        app_date = date(2025, 6, 15)

    val_date     = app_date - timedelta(days=random.randint(1, 30))
    val_date_str = val_date.strftime("%d/%m/%Y")
    ref_no       = f"CB/GLD/{applicant_id}/{rand_6digits()}"
    appraiser_name = rand_south_indian_name()
    state_code   = random.choice(STATE_CODES)
    license_no   = f"BIS/APP/{state_code}/{rand_6digits()}"

    branch_info  = dict(BRANCH_REGISTRY.get(branch_ifsc, list(BRANCH_REGISTRY.values())[0]))
    branch_info["ifsc"] = branch_ifsc

    item_type    = random.choice(ITEM_TYPES)
    descriptions = {
        "Ring":     "Plain gold ring with smooth finish, no stone inlay",
        "Bangle":   "Round gold bangle with traditional knotted design",
        "Chain":    "Gold chain with box-link pattern, lobster clasp",
        "Necklace": "Traditional gold necklace with pendant mount setting",
        "Earring":  "Pair of gold drop earrings with hook fittings",
    }
    description  = descriptions[item_type]
    hallmark_no  = rand_hallmark()
    karat        = random.choice(["24K", "22K", "18K", "14K"])
    purity_factor = PURITY_FACTOR[karat]

    gross_weight = round(random.uniform(5.0, 200.0), 3)
    stone_weight = round(random.uniform(0.0, min(5.0, gross_weight * 0.05)), 3)
    net_gold_weight = round(gross_weight - stone_weight, 3)

    market_rate = get_gold_rate(val_date)
    base_rate   = round(market_rate * (purity_factor / PURITY_FACTOR["22K"]), 2)

    forged_variant       = None
    actual_purity_factor = purity_factor
    calc_gross           = gross_weight
    calc_net             = net_gold_weight
    rate_used            = base_rate
    stated_karat         = karat
    display_gross        = gross_weight

    if is_forged:
        forged_variant = random.choice(["A", "B", "C", "D"])

    if is_forged and forged_variant == "C":
        factor       = random.uniform(1.15, 1.30)
        calc_gross   = round(gross_weight * factor, 3)
        calc_net     = round(calc_gross - stone_weight, 3)
        display_gross = calc_gross

    if is_forged and forged_variant == "B":
        rate_used = round(base_rate * random.uniform(1.20, 1.35), 2)

    if is_forged and forged_variant == "D":
        stated_karat         = "22K"
        actual_purity_factor = PURITY_FACTOR["18K"]

    pure_gold_weight = round(calc_net * actual_purity_factor, 4)
    computed_value   = round(pure_gold_weight * rate_used, 2)

    if is_forged and forged_variant == "A":
        declared_value = round(computed_value * random.uniform(1.15, 1.45), 2)
    else:
        declared_value = round(computed_value * (1 + random.uniform(-0.01, 0.01)), 2)

    ltv          = random.uniform(0.73, 0.85) if is_forged else random.uniform(0.60, 0.74)
    loan_amount  = round(declared_value * ltv, 2)
    ltv_ratio    = round(loan_amount / declared_value, 4) if declared_value > 0 else 0.0

    return {
        "ref_no":            ref_no,
        "valuation_date":    val_date_str,
        "applicant_id":      applicant_id,
        "appraiser_name":    appraiser_name,
        "license_no":        license_no,
        "branch_ifsc":       branch_ifsc,
        "branch_info":       branch_info,
        "item_type":         item_type,
        "description":       description,
        "hallmark_no":       hallmark_no,
        "gross_weight":      display_gross,
        "true_gross_weight": gross_weight,
        "stone_weight":      stone_weight,
        "net_gold_weight":   calc_net,
        "karat":             stated_karat,
        "purity_factor":     actual_purity_factor,
        "pure_gold_weight":  pure_gold_weight,
        "market_rate_22k":   market_rate,
        "gold_rate_used":    rate_used,
        "computed_value":    computed_value,
        "declared_value":    declared_value,
        "loan_amount":       loan_amount,
        "ltv_ratio":         ltv_ratio,
        "is_forged":         is_forged,
        "forged_variant":    forged_variant,
    }

# ============================================================================
#  PDF RENDERER
# ============================================================================

class GoldAppraisalRenderer:

    def __init__(self, path, applicant_id):
        self.path = path
        self.applicant_id = applicant_id
        self.c = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle(f"Gold Appraisal Report - {applicant_id}")
        self.c.setAuthor("Canara Bank")
        self.c.setSubject("Gold Loan Appraisal Document")
        self.c.setCreator("Canara-Core-System v4.1.2")
        self.c._doc.info.producer = "Canara-Core-System v4.1.2"

    def _draw_watermark(self):
        c = self.c
        c.saveState()
        c.setFillColor(Color(0.75, 0.75, 0.75, alpha=0.08))
        c.setFont("Helvetica-Bold", 22)
        c.rotate(38)
        for xi in range(-3, 12):
            for yi in range(-6, 14):
                c.drawString(xi * 160, yi * 80, "CANARA BANK")
        c.restoreState()

    def _draw_header(self, data):
        c = self.c
        w, h = PAGE_W, PAGE_H
        c.setFillColor(CANARA_BLUE)
        c.rect(0, h - 22*mm, w, 22*mm, fill=1, stroke=0)
        c.setFillColor(CANARA_GOLD)
        c.rect(0, h - 24*mm, w, 2*mm, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 20)
        c.drawString(MARGIN, h - 14*mm, "CANARA BANK")
        c.setFont("Helvetica", 7.5)
        c.drawString(MARGIN, h - 18.5*mm,
                     "A Government of India Undertaking  |  Estd. 1906  |  Nationalised in 1969")
        c.setFont("Helvetica-Oblique", 7)
        c.drawRightString(w - MARGIN, h - 13*mm, '"Together We Can"')
        c.setFillColor(CANARA_LIGHT)
        c.rect(0, h - 44*mm, w, 20*mm, fill=1, stroke=0)
        bi = data["branch_info"]
        c.setFillColor(CANARA_BLUE)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(MARGIN, h - 29.5*mm, f"Branch: {bi['name']}")
        c.setFont("Helvetica", 7.5)
        c.setFillColor(TEXT_MED)
        c.drawString(MARGIN, h - 33.5*mm, f"IFSC: {bi['ifsc']}   |   PIN: {bi['pin']}")
        c.drawString(MARGIN, h - 37.5*mm, f"Ph: {bi['phone']}  |  Email: {bi['email']}")
        c.drawString(MARGIN, h - 41.5*mm,
                     "Head Office: 112, J.C. Road, Bengaluru - 560 002, Karnataka, India")
        qr_buf = make_qr_image(f"CB-GLD-{data['applicant_id']}-{data['ref_no']}", size=70)
        c.drawImage(ImageReader(qr_buf), w - MARGIN - 25*mm, h - 42*mm,
                    25*mm, 25*mm, preserveAspectRatio=True)
        c.setFont("Helvetica", 5.5)
        c.setFillColor(TEXT_LIGHT)
        c.drawCentredString(w - MARGIN - 12.5*mm, h - 43.5*mm, "Scan to Verify")
        badge_x = w - MARGIN - 60*mm
        c.setFillColor(CANARA_GOLD)
        c.roundRect(badge_x, h - 33*mm, 30*mm, 7*mm, 2, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawCentredString(badge_x + 15*mm, h - 28.5*mm, "GOLD APPRAISAL REPORT")
        c.setFillColor(TEXT_MED)
        c.setFont("Helvetica", 7)
        c.drawString(badge_x, h - 37.5*mm, f"Ref No: {data['ref_no']}")
        c.drawString(badge_x, h - 40.5*mm, f"Date: {data['valuation_date']}")
        c.setStrokeColor(CANARA_BLUE)
        c.setLineWidth(0.8)
        c.line(MARGIN, h - 45*mm, w - MARGIN, h - 45*mm)

    def _draw_footer(self):
        c = self.c
        w  = PAGE_W
        fy = 12 * mm
        c.setStrokeColor(CANARA_BLUE)
        c.setLineWidth(0.5)
        c.line(MARGIN, fy + 6*mm, w - MARGIN, fy + 6*mm)
        c.setFillColor(CANARA_BLUE)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawString(MARGIN, fy + 3.5*mm, "CANARA BANK - GOLD LOAN APPRAISAL DOCUMENT")
        c.setFillColor(TEXT_MED)
        c.setFont("Helvetica", 6)
        c.drawCentredString(w / 2, fy + 3.5*mm, f"Applicant ID: {self.applicant_id}")
        c.drawRightString(w - MARGIN, fy + 3.5*mm, "Page 1 of 1")
        c.setFillColor(CANARA_RED)
        c.setFont("Helvetica-Bold", 5.5)
        c.drawCentredString(w / 2, fy + 0.8*mm, "STRICTLY CONFIDENTIAL - NOT FOR CIRCULATION")

    def _section_title(self, title, y):
        c = self.c
        x0 = MARGIN
        x1 = PAGE_W - MARGIN
        c.setFillColor(CANARA_BLUE)
        c.rect(x0, y, x1 - x0, 6*mm, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x0 + 3*mm, y + 1.8*mm, title.upper())
        return y - 1*mm

    def _field_row(self, label, value, x, y, col_w=80*mm, value_bold=False, font_size=8.0):
        c = self.c
        c.setFillColor(TEXT_LIGHT)
        c.setFont("Helvetica", font_size - 0.5)
        c.drawString(x, y, label)
        c.setFillColor(TEXT_DARK)
        if value_bold:
            c.setFont("Helvetica-Bold", font_size)
        else:
            c.setFont("Helvetica", font_size)
        c.drawString(x + col_w * 0.48, y, str(value))
        c.setStrokeColor(HexColor("#DDDDDD"))
        c.setLineWidth(0.3)
        c.line(x, y - 0.8*mm, x + col_w, y - 0.8*mm)

    def _signature_box(self, x, y, w, label):
        c = self.c
        c.setStrokeColor(TEXT_MED)
        c.setLineWidth(0.4)
        c.rect(x, y, w, 14*mm, stroke=1, fill=0)
        c.setFillColor(TEXT_LIGHT)
        c.setFont("Helvetica", 6.5)
        c.drawCentredString(x + w / 2, y + 10*mm, "Signature & Stamp")
        c.line(x + 4*mm, y + 6*mm, x + w - 4*mm, y + 6*mm)
        c.setFillColor(TEXT_MED)
        c.setFont("Helvetica", 6)
        c.drawCentredString(x + w / 2, y + 1.5*mm, label)

    def render(self, data):
        c = self.c
        w, h = PAGE_W, PAGE_H

        self._draw_watermark()
        self._draw_header(data)
        self._draw_footer()

        seal_buf = make_bank_seal(size=int(28*mm / mm * 3.78))
        c.saveState()
        c.setFillAlpha(0.40)
        c.drawImage(ImageReader(seal_buf),
                    w - MARGIN - 28*mm, 12*mm + 8*mm,
                    28*mm, 28*mm, preserveAspectRatio=True, mask="auto")
        c.restoreState()

        row_h  = 6.8*mm
        col_w  = (w - 2*MARGIN - 8*mm) / 2
        lx     = MARGIN
        rx     = MARGIN + col_w + 8*mm
        y      = h - 49*mm

        # Section 1 - Document Metadata
        y = self._section_title("1. Document Metadata", y)
        y -= row_h
        for label, val in [("Ref No", data["ref_no"]),
                            ("Date",   data["valuation_date"]),
                            ("Applicant ID", data["applicant_id"])]:
            self._field_row(label, val, lx, y, col_w=col_w)
            y -= row_h
        y -= 2*mm

        # Section 2 - Appraiser Details
        y = self._section_title("2. Appraiser Details", y)
        y -= row_h
        app_fields = [("Appraiser Name", data["appraiser_name"]),
                      ("License No",     data["license_no"]),
                      ("Valuation Date", data["valuation_date"]),
                      ("Branch IFSC",    data["branch_ifsc"])]
        for i, (lbl, val) in enumerate(app_fields):
            self._field_row(lbl, val, lx if i % 2 == 0 else rx, y, col_w=col_w)
            if i % 2 == 1:
                y -= row_h
        y -= row_h + 2*mm

        # Section 3 - Item Description
        y = self._section_title("3. Item Description", y)
        y -= row_h
        self._field_row("Item Type",   data["item_type"],  lx, y, col_w=col_w)
        self._field_row("Hallmark No", data["hallmark_no"], rx, y, col_w=col_w)
        y -= row_h
        c.setFillColor(TEXT_LIGHT)
        c.setFont("Helvetica", 7.5)
        c.drawString(lx, y, "Description")
        c.setFillColor(TEXT_DARK)
        c.setFont("Helvetica", 7.5)
        c.drawString(lx + col_w * 0.24, y, data["description"])
        c.setStrokeColor(HexColor("#DDDDDD"))
        c.setLineWidth(0.3)
        c.line(lx, y - 0.8*mm, w - MARGIN, y - 0.8*mm)
        y -= row_h + 2*mm

        # Section 4 - Weight & Purity
        y = self._section_title("4. Weight & Purity", y)
        y -= row_h
        w_fields = [
            ("Gross Weight (g)",    f"{data['gross_weight']:.3f}"),
            ("Stone Weight (g)",    f"{data['stone_weight']:.3f}"),
            ("Net Gold Weight (g)", f"{data['net_gold_weight']:.3f}"),
            ("Purity (Karat)",      data["karat"]),
            ("Purity Factor",       f"{data['purity_factor']:.4f}"),
            ("Pure Gold Weight (g)", f"{data['pure_gold_weight']:.4f}"),
        ]
        for i, (lbl, val) in enumerate(w_fields):
            bold = (lbl == "Pure Gold Weight (g)")
            self._field_row(lbl, val, lx if i % 2 == 0 else rx, y, col_w=col_w, value_bold=bold)
            if i % 2 == 1:
                y -= row_h
        y -= 2*mm

        # Section 5 - Valuation
        y = self._section_title("5. Valuation", y)
        y -= row_h
        v_fields = [
            ("Gold Rate (Rs/gram)", f"Rs {data['gold_rate_used']:,.2f}"),
            ("Computed Value (Rs)", f"Rs {data['computed_value']:,.2f}"),
            ("Declared Value (Rs)", f"Rs {data['declared_value']:,.2f}"),
        ]
        for i, (lbl, val) in enumerate(v_fields):
            bold = (lbl == "Declared Value (Rs)")
            self._field_row(lbl, val, lx if i % 2 == 0 else rx, y, col_w=col_w, value_bold=bold)
            if i % 2 == 1:
                y -= row_h
        y -= row_h + 2*mm

        # Section 6 - Loan Details
        y = self._section_title("6. Loan Details", y)
        y -= row_h
        self._field_row("Loan Amount Requested (Rs)", f"Rs {data['loan_amount']:,.2f}",
                        lx, y, col_w=col_w, value_bold=True, font_size=9.0)
        self._field_row("LTV Ratio", f"{data['ltv_ratio']:.2%}",
                        rx, y, col_w=col_w, value_bold=True, font_size=9.0)
        y -= row_h + 5*mm

        # Signature boxes
        sig_w = 52*mm
        sig_y = max(y - 14*mm, 40*mm)
        self._signature_box(lx, sig_y, sig_w, "Certified Appraiser")
        self._signature_box(lx + sig_w + 10*mm, sig_y, sig_w, "Branch Manager")
        self._signature_box(w - MARGIN - sig_w, sig_y, sig_w, "Applicant / Pledger")

        decl_y = sig_y - 6*mm
        c.setFillColor(TEXT_MED)
        c.setFont("Helvetica-Oblique", 6.5)
        c.drawCentredString(w / 2, decl_y,
            "I certify that the above gold article(s) have been physically examined and "
            "valued as per BIS hallmarking standards and prevailing MCX rates.")

        c.save()

# ============================================================================
#  MANIFEST & INDEX UPDATERS
# ============================================================================

def update_manifest_with_gold(manifest_path, gold_data, pdf_relative_path):
    with open(manifest_path, "r") as f:
        manifest = json.load(f)
    manifest.setdefault("files", {})
    manifest["files"]["gold_appraisal"]  = pdf_relative_path
    manifest["gold_gross_weight"]         = gold_data["gross_weight"]
    manifest["gold_net_weight"]           = gold_data["net_gold_weight"]
    manifest["gold_karat"]                = gold_data["karat"]
    manifest["gold_rate_used"]            = gold_data["gold_rate_used"]
    manifest["gold_declared_value"]       = gold_data["declared_value"]
    manifest["gold_loan_amount"]          = gold_data["loan_amount"]
    manifest["gold_ltv_ratio"]            = gold_data["ltv_ratio"]
    manifest["gold_forged"]               = gold_data["is_forged"]
    manifest["gold_forged_variant"]       = gold_data["forged_variant"]
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    return manifest

def update_dataset_index(index_path, updated_manifests):
    with open(index_path, "r") as f:
        index = json.load(f)
    gold_lookup = {m["applicant_id"]: m for m in updated_manifests}
    for pkt in index["packets"]:
        aid = pkt.get("applicant_id")
        if aid in gold_lookup:
            gm = gold_lookup[aid]
            pkt.setdefault("files", {})
            pkt["files"]["gold_appraisal"] = gm["files"].get("gold_appraisal", "gold_appraisal.pdf")
            pkt["gold_gross_weight"]        = gm["gold_gross_weight"]
            pkt["gold_net_weight"]          = gm["gold_net_weight"]
            pkt["gold_karat"]               = gm["gold_karat"]
            pkt["gold_rate_used"]           = gm["gold_rate_used"]
            pkt["gold_declared_value"]      = gm["gold_declared_value"]
            pkt["gold_loan_amount"]         = gm["gold_loan_amount"]
            pkt["gold_ltv_ratio"]           = gm["gold_ltv_ratio"]
            pkt["gold_forged"]              = gm["gold_forged"]
            pkt["gold_forged_variant"]      = gm["gold_forged_variant"]
    with open(index_path, "w") as f:
        json.dump(index, f, indent=2)
    print(f"  [INDEX]  Updated {index_path} with {len(updated_manifests)} gold entries.")

# ============================================================================
#  MAIN ORCHESTRATOR
# ============================================================================

def run(base_dir="realistic document", n_genuine=50, n_forged=50, verbose=True):
    base = Path(base_dir)
    index_path = base / "dataset_index.json"
    updated_manifests = []
    generated = 0

    tasks = (
        [("safe",   i, False) for i in range(1, n_genuine + 1)] +
        [("risked", i, True)  for i in range(1, n_forged  + 1)]
    )

    for cls, idx, is_forged in tasks:
        app_dir = base / cls / f"applicant_{idx:04d}"
        manifest_path = app_dir / "manifest.json"
        if not manifest_path.exists():
            if verbose:
                print(f"  [SKIP]   {cls}/applicant_{idx:04d} - manifest.json not found")
            continue

        with open(manifest_path, "r") as f:
            manifest = json.load(f)

        applicant_id = manifest["applicant_id"]
        doc_date     = manifest.get("doc_date", "01/06/2025")
        branch_ifsc  = manifest.get("branch_ifsc", "CNRB0001234")

        gold_data = generate_gold_appraisal_data(
            applicant_id=applicant_id,
            application_date_str=doc_date,
            branch_ifsc=branch_ifsc,
            is_forged=is_forged,
        )

        pdf_path = app_dir / "gold_appraisal.pdf"
        GoldAppraisalRenderer(str(pdf_path), applicant_id).render(gold_data)

        updated = update_manifest_with_gold(manifest_path, gold_data, "gold_appraisal.pdf")
        updated_manifests.append(updated)
        generated += 1

        if verbose and generated % 10 == 0:
            pct = generated / len(tasks) * 100
            variant_str = f"FORGED-{gold_data['forged_variant']}" if is_forged else "GENUINE"
            print(f"  [{pct:5.1f}%]  {generated}/{len(tasks)}  {cls}/applicant_{idx:04d}  [{variant_str}]")

    if index_path.exists():
        update_dataset_index(index_path, updated_manifests)
    else:
        if verbose:
            print(f"  [WARN]   dataset_index.json not found at {index_path}")

    if verbose:
        print(f"\n{'='*60}")
        print(f"  GOLD APPRAISAL GENERATOR v1.0 - Complete")
        print(f"{'='*60}")
        print(f"  Generated  : {generated} gold_appraisal.pdf files")
        print(f"  Genuine    : {n_genuine}  (safe/applicant_0001 - {n_genuine:04d})")
        print(f"  Forged     : {n_forged}  (risked/applicant_0001 - {n_forged:04d})")
        print(f"  Output dir : {base.resolve()}")
        print(f"{'='*60}")

    return updated_manifests


if __name__ == "__main__":
    import sys
    base = sys.argv[1] if len(sys.argv) > 1 else "realistic document"
    ng   = int(sys.argv[2]) if len(sys.argv) > 2 else 50
    nf   = int(sys.argv[3]) if len(sys.argv) > 3 else 50
    print(f"\n{'='*60}")
    print(f"  AEGIS GOLD APPRAISAL GENERATOR  v1.0")
    print(f"  Genuine: {ng}   Forged: {nf}   Base dir: {base}")
    print(f"{'='*60}\n")
    run(base_dir=base, n_genuine=ng, n_forged=nf, verbose=True)
