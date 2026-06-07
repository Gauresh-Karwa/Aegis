"""
=============================================================================
AEGIS DOSSIER FACTORY  v2.0
Senior Lead Architect: Document Forensics & AI Data Engineering
-----------------------------------------------------------------------------
Generates synthetic, high-fidelity Indian banking document datasets for
training multi-modal fraud detection models (CNN + FNN).

Produces 4 PDFs per applicant:
  identity.pdf     – Aadhaar-style identity document
  salary.pdf       – Detailed salary slip (2-page)
  itr.pdf          – Income Tax Return (ITR-1)
  land_record.pdf  – Land / Property Record (RoR)

Tampering engine injects 7 forensic anomaly classes when is_risked=True.
=============================================================================
"""

import os, json, math, random, string, textwrap, hashlib
from datetime import date, timedelta
from pathlib import Path
from io import BytesIO

# ---------- ReportLab ---------------------------------------------------
from reportlab.pdfgen    import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib        import colors
from reportlab.lib.colors import (
    HexColor, Color, black, white, grey, lightgrey,
    CMYKColor
)
from reportlab.lib.units  import mm, cm
from reportlab.pdfbase    import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus   import Table, TableStyle
from reportlab.lib.utils import ImageReader

# ---------- Pillow / QR --------------------------------------------------
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import qrcode

# ---------- Faker --------------------------------------------------------
from faker import Faker
fake = Faker("en_IN")
random.seed()                          # non-deterministic across runs

# =========================================================================
#  CONSTANTS
# =========================================================================
PAGE_W, PAGE_H   = A4                 # 595.27 x 841.89 pt  (1pt = 1/72 in)
MARGIN           = 18 * mm
HEADER_H         = 42 * mm
FOOTER_H         = 12 * mm
DPI              = 300

CANARA_BLUE      = HexColor("#003F87")
CANARA_GOLD      = HexColor("#B8860B")
CANARA_LIGHT     = HexColor("#E8F0F8")
CANARA_RED       = HexColor("#C0392B")
STRIPE_GREY      = HexColor("#F5F5F5")
TEXT_DARK        = HexColor("#1A1A1A")
TEXT_MED         = HexColor("#444444")
TEXT_LIGHT       = HexColor("#888888")
LINE_BLUE        = HexColor("#5A8FCC")

# District / circle rates for Karnataka (realistic)
DISTRICTS_KA = [
    ("Bengaluru Urban",  "Jayanagar",   8500),
    ("Bengaluru Rural",  "Devanahalli", 3200),
    ("Mysuru",           "Vijayanagar", 2800),
    ("Tumakuru",         "Gubbi",       1800),
    ("Hubballi-Dharwad", "Keshwapur",   2200),
    ("Belagavi",         "Shahpur",     1600),
    ("Mangaluru",        "Kadri",       4100),
    ("Ballari",          "Toranagal",   1400),
]

BANK_BRANCHES = [
    ("Jayanagar 4th Block", "CNRB0001234", "560041"),
    ("Malleswaram",         "CNRB0002345", "560003"),
    ("Indiranagar",         "CNRB0003456", "560038"),
    ("Koramangala",         "CNRB0004567", "560034"),
    ("Rajajinagar",         "CNRB0005678", "560010"),
]

EMPLOYERS = [
    ("Infosys Limited",          "Infosys Ltd"),
    ("Wipro Technologies",       "Wipro Technologies Pvt Ltd"),
    ("Tech Mahindra",            "Tech Mahindra Pvt Ltd"),
    ("Tata Consultancy Services","TCS Limited"),
    ("HCL Technologies",         "HCL Technologies Ltd"),
    ("Accenture Solutions",      "Accenture Solutions Pvt Ltd"),
    ("Cognizant Technology",     "Cognizant Technology Solutions"),
    ("L&T Infotech",             "LTIMindtree Limited"),
]

ITR_SECTIONS = ["17(1)", "17(2)", "17(3)"]

# =========================================================================
#  UTILITY HELPERS
# =========================================================================

def rand_pan() -> str:
    """Generate a realistic PAN-format string."""
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return (random.choice(letters) + random.choice(letters) +
            random.choice(letters) + random.choice("ABCFGHLJPT") +
            random.choice(letters) +
            "".join(random.choices("0123456789", k=4)) +
            random.choice(letters))

def rand_aadhaar() -> str:
    """Masked Aadhaar (last 4 visible)."""
    return "XXXX XXXX " + "".join(random.choices("0123456789", k=4))

def rand_gstn(state_code: str = "29") -> str:
    """Realistic GSTN format."""
    return (state_code +
            rand_pan() +
            random.choice("123456789") +
            "Z" +
            random.choice("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"))

def rand_pf() -> str:
    return f"KA/BN/{random.randint(10000,99999)}/{random.randint(1000,9999)}"

def rand_esi() -> str:
    return "".join(random.choices("0123456789", k=17))

def rand_uan() -> str:
    return "".join(random.choices("0123456789", k=12))

def rand_survey() -> str:
    return f"{random.randint(1,999)}/{random.randint(1,20)}"

def rand_khasra() -> str:
    return f"{random.randint(100,9999)}-{random.choice('ABCDE')}"

def rand_account() -> str:
    return "".join(random.choices("0123456789", k=14))

def rand_loan_ref() -> str:
    return "CB" + "".join(random.choices("0123456789ABCDEF", k=10)).upper()

def format_inr(amount: float) -> str:
    """Format number as Indian currency string."""
    s = f"{amount:,.2f}"
    return s

def indian_num_words(n: int) -> str:
    """Convert integer to Indian number system words (simplified)."""
    if n >= 10_000_000:
        return f"{n/10_000_000:.2f} Crore"
    elif n >= 100_000:
        return f"{n/100_000:.2f} Lakh"
    elif n >= 1_000:
        return f"{n/1_000:.2f} Thousand"
    return str(n)

def fake_address() -> str:
    street_nums = ["No. " + str(random.randint(1,200))]
    streets = ["MG Road", "Gandhi Nagar", "Nehru Street", "Rajiv Gandhi Nagar",
               "Ambedkar Road", "Indira Nagar", "Shivaji Road", "Patel Layout",
               "Vivekananda Road", "Subhash Chandra Bose Avenue"]
    areas   = ["Jayanagar", "Koramangala", "Malleswaram", "Rajajinagar",
               "Indiranagar", "BTM Layout", "HSR Layout", "Yelahanka",
               "Electronic City", "Whitefield"]
    cities  = ["Bengaluru", "Mysuru", "Hubballi", "Belagavi", "Mangaluru"]
    return f"{random.choice(street_nums)}, {random.choice(streets)}, {random.choice(areas)}, {random.choice(cities)}, Karnataka"

def make_qr_image(data: str, size: int = 80) -> BytesIO:
    """Render a QR code to a BytesIO PNG."""
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

def make_bank_seal(size: int = 110) -> BytesIO:
    """
    Render a circular Canara Bank official seal in PIL.
    Returns PNG bytes.
    """
    sz = size * 3          # render at 3× then downscale (anti-alias)
    img = Image.new("RGBA", (sz, sz), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    c = sz // 2
    r_outer = c - 4
    r_inner = c - 18

    # Outer ring
    draw.ellipse([4, 4, sz-4, sz-4], outline=(0, 63, 135, 220), width=6)
    # Inner ring
    draw.ellipse([18, 18, sz-18, sz-18], outline=(0, 63, 135, 200), width=3)

    # Centre fill (semi-transparent)
    draw.ellipse([20, 20, sz-20, sz-20], fill=(0, 63, 135, 40))

    # Text around circle
    try:
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
        font_lg = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
    except:
        font_sm = ImageFont.load_default()
        font_lg = font_sm

    # Draw "CANARA BANK" arc text (top)
    arc_text = "★  CANARA BANK  ★"
    for i, ch in enumerate(arc_text):
        angle = -90 + (i - len(arc_text)/2) * (180 / max(len(arc_text), 1))
        rad   = math.radians(angle)
        tx = c + int((r_outer - 12) * math.cos(rad)) - 6
        ty = c + int((r_outer - 12) * math.sin(rad)) - 11
        draw.text((tx, ty), ch, font=font_sm, fill=(0, 63, 135, 230))

    # Centre text
    draw.text((c - 38, c - 24), "OFFICIAL", font=font_lg, fill=(0, 63, 135, 200))
    draw.text((c - 26, c + 2),  "SEAL",     font=font_lg, fill=(0, 63, 135, 200))

    # "AUTHORIZED SIGNATORY" arc text (bottom)
    bot_text = "AUTHORIZED SIGNATORY"
    for i, ch in enumerate(bot_text):
        angle = 90 + (i - len(bot_text)/2) * (160 / max(len(bot_text), 1))
        rad   = math.radians(angle)
        tx = c + int((r_outer - 12) * math.cos(rad)) - 6
        ty = c + int((r_outer - 12) * math.sin(rad)) - 11
        draw.text((tx, ty), ch, font=font_sm, fill=(0, 63, 135, 220))

    img = img.resize((size, size), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf

# =========================================================================
#  BASE CANVAS PAINTER  (shared across all document types)
# =========================================================================

class BasePainter:
    """Encapsulates low-level ReportLab canvas helpers."""

    def __init__(self, path: str, metadata: dict):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle(metadata.get("title", ""))
        self.c.setAuthor(metadata.get("author", "Canara Bank"))
        self.c.setSubject(metadata.get("subject", ""))
        self.c.setCreator(metadata.get("creator", "Canara-Core-System"))
        self.c._doc.info.producer = metadata.get("producer", "Canara-Core-System")

    # ------------------------------------------------------------------ #
    #  BACKGROUND WATERMARK
    # ------------------------------------------------------------------ #
    def draw_watermark(self):
        """Tile 'CANARA BANK' diagonally across the page (grey, low opacity)."""
        c = self.c
        c.saveState()
        c.setFillColor(Color(0.75, 0.75, 0.75, alpha=0.08))
        c.setFont("Helvetica-Bold", 22)
        c.rotate(38)
        step_x, step_y = 160, 80
        for xi in range(-3, 12):
            for yi in range(-6, 14):
                c.drawString(xi * step_x, yi * step_y, "CANARA BANK")
        c.restoreState()

    # ------------------------------------------------------------------ #
    #  PAGE HEADER
    # ------------------------------------------------------------------ #
    def draw_header(self, branch: tuple, doc_type: str,
                    ref_no: str, date_str: str, qr_data: str):
        """
        Renders the full Canara Bank document header including:
          - Bank name bar, branch details, IFSC
          - Document type badge
          - QR code placeholder
          - Reference number & date
        """
        c = self.c
        w, h = PAGE_W, PAGE_H

        # ---- top colour bar ------------------------------------------
        c.setFillColor(CANARA_BLUE)
        c.rect(0, h - 22*mm, w, 22*mm, fill=1, stroke=0)

        # ---- gold accent stripe --------------------------------------
        c.setFillColor(CANARA_GOLD)
        c.rect(0, h - 24*mm, w, 2*mm, fill=1, stroke=0)

        # ---- Bank name -----------------------------------------------
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 20)
        c.drawString(MARGIN, h - 14*mm, "CANARA BANK")
        c.setFont("Helvetica", 7.5)
        c.drawString(MARGIN, h - 18.5*mm, "A Government of India Undertaking  |  Estd. 1906  |  Nationalised in 1969")

        # ---- right-side tagline --------------------------------------
        c.setFont("Helvetica-Oblique", 7)
        c.drawRightString(w - MARGIN, h - 13*mm, "\"Together We Can\"")

        # ---- second header band (light blue) -------------------------
        c.setFillColor(CANARA_LIGHT)
        c.rect(0, h - 44*mm, w, 20*mm, fill=1, stroke=0)

        # ---- branch block -------------------------------------------
        branch_name, ifsc, pin = branch
        c.setFillColor(CANARA_BLUE)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(MARGIN, h - 29.5*mm, f"Branch: {branch_name}")
        c.setFont("Helvetica", 7.5)
        c.setFillColor(TEXT_MED)
        c.drawString(MARGIN, h - 33.5*mm, f"IFSC: {ifsc}   |   PIN: {pin}")
        c.drawString(MARGIN, h - 37.5*mm, f"Ph: 080-{random.randint(2000,4999)}{random.randint(1000,9999)}  |  Email: {ifsc.lower()}@canarabank.com")
        c.drawString(MARGIN, h - 41.5*mm, "Head Office: 112, J.C. Road, Bengaluru – 560 002, Karnataka, India")

        # ---- QR code (top-right) ------------------------------------
        qr_buf = make_qr_image(qr_data, size=70)
        c.drawImage(ImageReader(qr_buf), w - MARGIN - 25*mm, h - 42*mm, 25*mm, 25*mm,
                    preserveAspectRatio=True)
        c.setFont("Helvetica", 5.5)
        c.setFillColor(TEXT_LIGHT)
        c.drawCentredString(w - MARGIN - 12.5*mm, h - 43.5*mm, "Scan to Verify")

        # ---- Document type badge ------------------------------------
        badge_x = w - MARGIN - 58*mm
        c.setFillColor(CANARA_GOLD)
        c.roundRect(badge_x, h - 33*mm, 28*mm, 7*mm, 2, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(badge_x + 14*mm, h - 28.5*mm, doc_type)

        # ---- Ref no & date ------------------------------------------
        c.setFillColor(TEXT_MED)
        c.setFont("Helvetica", 7)
        c.drawString(badge_x, h - 37.5*mm, f"Ref No: {ref_no}")
        c.drawString(badge_x, h - 40.5*mm, f"Date: {date_str}")

        # ---- bottom divider line ------------------------------------
        c.setStrokeColor(CANARA_BLUE)
        c.setLineWidth(0.8)
        c.line(MARGIN, h - 45*mm, w - MARGIN, h - 45*mm)

    # ------------------------------------------------------------------ #
    #  PAGE FOOTER
    # ------------------------------------------------------------------ #
    def draw_footer(self, page_num: int, total_pages: int, applicant_id: str):
        c = self.c
        w  = PAGE_W
        fy = FOOTER_H

        c.setStrokeColor(CANARA_BLUE)
        c.setLineWidth(0.5)
        c.line(MARGIN, fy + 6*mm, w - MARGIN, fy + 6*mm)

        c.setFillColor(CANARA_BLUE)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawString(MARGIN, fy + 3.5*mm, "CANARA BANK – INTERNAL BANKING DOCUMENT")

        c.setFillColor(TEXT_MED)
        c.setFont("Helvetica", 6)
        c.drawCentredString(w / 2, fy + 3.5*mm, f"Applicant ID: {applicant_id}")
        c.drawRightString(w - MARGIN, fy + 3.5*mm, f"Page {page_num} of {total_pages}")

        c.setFillColor(CANARA_RED)
        c.setFont("Helvetica-Bold", 5.5)
        c.drawCentredString(w / 2, fy + 0.8*mm, "STRICTLY CONFIDENTIAL – NOT FOR CIRCULATION")

    # ------------------------------------------------------------------ #
    #  BANK SEAL
    # ------------------------------------------------------------------ #
    def draw_seal(self, x=None, y=None, size=28*mm):
        """Place semi-transparent bank seal."""
        c = self.c
        if x is None:
            x = PAGE_W - MARGIN - size
        if y is None:
            y = FOOTER_H + 8*mm
        seal_buf = make_bank_seal(size=int(size / mm * 3.78))
        c.saveState()
        c.setFillAlpha(0.40)
        c.drawImage(ImageReader(seal_buf), x, y, size, size,
                    preserveAspectRatio=True, mask="auto")
        c.restoreState()

    # ------------------------------------------------------------------ #
    #  SECTION TITLE
    # ------------------------------------------------------------------ #
    def section_title(self, title: str, y: float, full_width=True):
        c = self.c
        x0 = MARGIN
        x1 = PAGE_W - MARGIN if full_width else PAGE_W / 2 - 5*mm
        c.setFillColor(CANARA_BLUE)
        c.rect(x0, y, x1 - x0, 6*mm, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x0 + 3*mm, y + 1.8*mm, title.upper())
        return y - 1*mm

    # ------------------------------------------------------------------ #
    #  TWO-COLUMN FIELD ROW
    # ------------------------------------------------------------------ #
    def field_row(self, label: str, value: str, x: float, y: float,
                  col_w: float = 80*mm, value_bold=False,
                  label_color=None, value_color=None,
                  font_size: float = 8.0):
        c = self.c
        lc = label_color or TEXT_LIGHT
        vc = value_color or TEXT_DARK
        c.setFillColor(lc)
        c.setFont("Helvetica", font_size - 0.5)
        c.drawString(x, y, label)
        c.setFillColor(vc)
        if value_bold:
            c.setFont("Helvetica-Bold", font_size)
        else:
            c.setFont("Helvetica", font_size)
        c.drawString(x + col_w * 0.48, y, str(value))
        # underline
        c.setStrokeColor(HexColor("#DDDDDD"))
        c.setLineWidth(0.3)
        c.line(x, y - 0.8*mm, x + col_w, y - 0.8*mm)

    # ------------------------------------------------------------------ #
    #  HORIZONTAL TABLE
    # ------------------------------------------------------------------ #
    def draw_table(self, data: list, col_widths: list, x: float, y: float,
                   header_bg=None, alt_rows=True) -> float:
        """Draw a simple table; returns the y-position below the table."""
        c = self.c
        header_bg = header_bg or CANARA_BLUE
        row_h  = 6.5*mm
        n_cols = len(col_widths)

        for ri, row in enumerate(data):
            # background
            if ri == 0:
                c.setFillColor(header_bg)
            elif alt_rows and ri % 2 == 0:
                c.setFillColor(STRIPE_GREY)
            else:
                c.setFillColor(white)

            c.rect(x, y - row_h, sum(col_widths), row_h, fill=1, stroke=0)

            # cell borders
            c.setStrokeColor(HexColor("#CCCCCC"))
            c.setLineWidth(0.3)
            c.rect(x, y - row_h, sum(col_widths), row_h, fill=0, stroke=1)

            cx = x
            for ci, cell in enumerate(row):
                cw = col_widths[ci]
                if ri == 0:
                    c.setFillColor(white)
                    c.setFont("Helvetica-Bold", 7.5)
                else:
                    c.setFillColor(TEXT_DARK)
                    c.setFont("Helvetica", 7.5)
                c.drawString(cx + 2*mm, y - row_h + 2*mm, str(cell))
                cx += cw

            y -= row_h

        return y - 1*mm

    # ------------------------------------------------------------------ #
    #  SIGNATURE BOX
    # ------------------------------------------------------------------ #
    def signature_box(self, x: float, y: float, w: float = 50*mm,
                      label: str = "Authorized Signatory"):
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

    def save(self):
        self.c.save()


# =========================================================================
#  TAMPERING ENGINE
# =========================================================================

class TamperingEngine:
    """
    Injects surgical forensic anomalies into a rendered canvas.
    Called ONLY when is_risked=True.
    """

    @staticmethod
    def pixel_artifact(c: canvas.Canvas, x: float, y: float):
        """2-pixel black artifact near income field (clone-stamp simulation)."""
        c.saveState()
        c.setFillColor(black)
        # Cluster of 3–5 misaligned black micro-rectangles
        for _ in range(random.randint(3, 5)):
            ox = x + random.uniform(-1.5, 1.5) * mm
            oy = y + random.uniform(-1.5, 1.5) * mm
            c.rect(ox, oy, 0.6, 0.6, fill=1, stroke=0)
        c.restoreState()

    @staticmethod
    def blurred_edge(c: canvas.Canvas, x: float, y: float, w: float = 25*mm):
        """Simulate blurred/smeared edge using overlapping semi-transparent rects."""
        c.saveState()
        for i in range(5):
            alpha = 0.03 + i * 0.015
            c.setFillColor(Color(0.3, 0.3, 0.3, alpha=alpha))
            c.rect(x - i * 0.4, y - i * 0.3, w + i * 0.8, 3.5*mm, fill=1, stroke=0)
        c.restoreState()

    @staticmethod
    def tilted_amount(c: canvas.Canvas, x: float, y: float,
                      text: str, font_size: float = 9.0):
        """Draw amount text rotated by 0.5 degrees (imperceptible to human, detectable by CNN)."""
        c.saveState()
        c.translate(x, y)
        c.rotate(0.5)
        c.setFillColor(TEXT_DARK)
        c.setFont("Helvetica-Bold", font_size)
        c.drawString(0, 0, text)
        c.restoreState()

    @staticmethod
    def font_size_discrepancy(c: canvas.Canvas, x: float, y: float, text: str):
        """Render income value in slightly different font size (8.5 vs 8.0 baseline)."""
        c.setFont("Helvetica", 8.5)           # surrounding text is 8.0
        c.setFillColor(TEXT_DARK)
        c.drawString(x, y, text)

    @staticmethod
    def noise_stripe(c: canvas.Canvas, y: float):
        """Add a faint horizontal noise stripe (scanner artifact simulation)."""
        c.saveState()
        c.setFillColor(Color(0.6, 0.6, 0.6, alpha=0.04))
        c.rect(0, y, PAGE_W, 0.8, fill=1, stroke=0)
        c.restoreState()


# =========================================================================
#  DOCUMENT RENDERERS
# =========================================================================

class IdentityDocRenderer(BasePainter):
    """
    Renders an Aadhaar-inspired + Bank KYC identity document.
    """
    def render(self, applicant: dict, is_risked: bool, fraud_flags: list):
        c = self.c
        w, h = PAGE_W, PAGE_H

        self.draw_watermark()
        self.draw_header(
            branch=applicant["branch"],
            doc_type="KYC IDENTITY DOCUMENT",
            ref_no=applicant["identity_ref"],
            date_str=applicant["doc_date"],
            qr_data=f"CB-KYC-{applicant['applicant_id']}-{applicant['pan']}",
        )
        self.draw_footer(1, 1, applicant["applicant_id"])
        self.draw_seal()

        # ---- colour photo placeholder --------------------------------
        photo_x = PAGE_W - MARGIN - 30*mm
        photo_y = h - 90*mm
        c.setFillColor(CANARA_LIGHT)
        c.roundRect(photo_x, photo_y, 30*mm, 37*mm, 2, fill=1, stroke=0)
        c.setStrokeColor(CANARA_BLUE)
        c.setLineWidth(0.6)
        c.roundRect(photo_x, photo_y, 30*mm, 37*mm, 2, fill=0, stroke=1)
        c.setFillColor(TEXT_LIGHT)
        c.setFont("Helvetica", 6.5)
        c.drawCentredString(photo_x + 15*mm, photo_y + 18*mm, "Passport Size")
        c.drawCentredString(photo_x + 15*mm, photo_y + 15*mm, "Photograph")

        # ---- Unique ID Card box -------------------------------------
        cy = h - 50*mm
        c.setFillColor(CANARA_LIGHT)
        c.roundRect(MARGIN, cy - 8*mm, PAGE_W - 2*MARGIN - 33*mm, 10*mm, 3, fill=1, stroke=0)
        c.setFillColor(CANARA_BLUE)
        c.setFont("Helvetica-Bold", 11)
        uid = applicant["uid"]
        c.drawString(MARGIN + 4*mm, cy - 4*mm, f"UID: {uid}")
        c.setFont("Helvetica", 7)
        c.setFillColor(TEXT_MED)
        c.drawRightString(PAGE_W - MARGIN - 35*mm, cy - 4*mm, "Unique Identification Number")

        # ---- Section: PERSONAL INFORMATION -------------------------
        cy -= 14*mm
        self.section_title("Personal Information", cy, full_width=False)
        cy -= 7*mm

        fields_left = [
            ("Full Name (As per records)",  applicant["name"]),
            ("Date of Birth",               applicant["dob"]),
            ("Gender",                      applicant["gender"]),
            ("Nationality",                 "Indian"),
            ("Mother Tongue",               random.choice(["Kannada", "Telugu", "Tamil", "Hindi", "Malayalam"])),
        ]
        col_w = (PAGE_W - 2*MARGIN - 33*mm) / 2
        for label, val in fields_left:
            self.field_row(label, val, MARGIN, cy, col_w=col_w * 1.9)
            cy -= 6.5*mm

        # ---- Section: ADDRESS --------------------------------------
        cy -= 4*mm
        self.section_title("Address Details", cy, full_width=False)
        cy -= 7*mm

        addr_lines = applicant["address"].split(",")
        c.setFillColor(TEXT_LIGHT)
        c.setFont("Helvetica", 7.5)
        c.drawString(MARGIN, cy, "Current / Permanent Address:")
        cy -= 5*mm
        c.setFillColor(TEXT_DARK)
        c.setFont("Helvetica", 8)
        for line in addr_lines[:3]:
            c.drawString(MARGIN + 3*mm, cy, line.strip())
            cy -= 5*mm
        if len(addr_lines) > 3:
            c.drawString(MARGIN + 3*mm, cy, ", ".join(a.strip() for a in addr_lines[3:]))
            cy -= 5*mm

        cy -= 4*mm
        self.field_row("District", random.choice(DISTRICTS_KA)[0], MARGIN, cy, col_w=90*mm)
        cy -= 6.5*mm
        self.field_row("State", "Karnataka", MARGIN, cy, col_w=90*mm)
        cy -= 6.5*mm
        self.field_row("PIN Code", applicant["branch"][2], MARGIN, cy, col_w=90*mm)
        cy -= 6.5*mm

        # ---- Section: TAX / FINANCIAL IDENTIFIERS ------------------
        cy -= 4*mm
        self.section_title("Financial & Tax Identifiers", cy)
        cy -= 8*mm

        fin_fields = [
            ("PAN (Permanent Account Number)",  applicant["pan"]),
            ("Aadhaar (Masked)",                applicant["aadhaar"]),
            ("Voter ID (Form 16)",              applicant.get("voter_id", "Not Furnished")),
            ("Mobile (Registered)",             applicant["mobile"]),
            ("Email (Registered)",              applicant["email"]),
            ("Bank Account No.",                applicant["account_no"]),
            ("Bank Name",                       "Canara Bank"),
            ("Branch & IFSC",                   f"{applicant['branch'][0]} / {applicant['branch'][1]}"),
        ]
        half = len(fin_fields) // 2
        col_w = (PAGE_W - 2*MARGIN) / 2 - 3*mm
        for i, (label, val) in enumerate(fin_fields):
            col_x = MARGIN if i % 2 == 0 else MARGIN + col_w + 6*mm
            row_y = cy - (i // 2) * 6.5*mm
            self.field_row(label, val, col_x, row_y, col_w=col_w)

        cy -= (half + 1) * 6.5*mm + 4*mm

        # ---- KYC Compliance block -----------------------------------
        self.section_title("KYC Compliance & Declaration", cy)
        cy -= 8*mm

        kyc_text = (
            "I hereby declare that the information furnished above is true, complete, and correct to the best of my knowledge and belief. "
            "I undertake to inform the Bank of any change therein, immediately. In case any of the above information is found to be false "
            "or untrue or misleading or misrepresenting, I am aware that I may be held liable for it. The Bank is authorised to verify the "
            "information furnished, including through third-party sources, and to share the same with statutory authorities as required under "
            "applicable laws including PMLA 2002 and Income Tax Act 1961."
        )
        c.setFillColor(TEXT_MED)
        c.setFont("Helvetica", 7)
        text_obj = c.beginText(MARGIN, cy)
        text_obj.setFont("Helvetica", 7)
        text_obj.setFillColor(TEXT_MED)
        for line in textwrap.wrap(kyc_text, width=105):
            text_obj.textLine(line)
        c.drawText(text_obj)
        cy -= 22*mm

        # ---- Signature boxes ----------------------------------------
        self.signature_box(MARGIN, cy, label="Applicant Signature")
        self.signature_box(MARGIN + 60*mm, cy, label="Bank Official")
        self.signature_box(MARGIN + 120*mm, cy, label="Branch Manager")

        # ---- Tampering injections -----------------------------------
        if is_risked:
            te = TamperingEngine()
            if "pixel_artifact" in fraud_flags:
                te.pixel_artifact(c, MARGIN + 60*mm, h - 68*mm)
            if "blurred_edge" in fraud_flags:
                te.blurred_edge(c, MARGIN, h - 68*mm)
            if "noise_stripe" in fraud_flags:
                te.noise_stripe(c, h * 0.45)

        self.save()


class SalarySlipRenderer(BasePainter):
    """
    Renders a 2-page detailed salary slip following Indian payroll standards.
    Includes: Employer GSTN, PAN, PF, ESI, UAN, CTC breakdown, deductions.
    """
    def render(self, applicant: dict, is_risked: bool, fraud_flags: list):
        c = self.c
        w, h = PAGE_W, PAGE_H
        salary = applicant["salary"]

        # ================================================================
        #  PAGE 1 – SALARY SLIP
        # ================================================================
        self.draw_watermark()
        self.draw_header(
            branch=applicant["branch"],
            doc_type="PAYROLL SALARY SLIP",
            ref_no=applicant["salary_ref"],
            date_str=salary["pay_date"],
            qr_data=f"CB-SAL-{applicant['applicant_id']}-{salary['month_year']}",
        )
        self.draw_footer(1, 2, applicant["applicant_id"])
        self.draw_seal()

        cy = h - 50*mm

        # ---- Employer information block -----------------------------
        self.section_title("Employer Details", cy)
        cy -= 8*mm

        emp_fields = [
            ("Employer / Company Name",   salary["employer_name"]),
            ("Registered Office Address", salary["employer_address"]),
            ("GSTN",                      salary["gstn"]),
            ("CIN",                       salary.get("cin", "U72900KA2001PLC028214")),
            ("HR Contact",                salary.get("hr_email", "hr@company.com")),
            ("Pay Period",                salary["month_year"]),
            ("Pay Date",                  salary["pay_date"]),
            ("Working Days",              str(salary["working_days"])),
            ("LOP Days",                  str(salary.get("lop", 0))),
        ]
        col_w = (w - 2 * MARGIN) / 2 - 3 * mm
        for i, (label, val) in enumerate(emp_fields):
            col_x = MARGIN if i % 2 == 0 else MARGIN + col_w + 6 * mm
            row_y = cy - (i // 2) * 6.5 * mm
            self.field_row(label, val, col_x, row_y, col_w=col_w)
        cy -= (len(emp_fields) // 2 + 1) * 6.5 * mm + 4 * mm

        # ---- Employee information -----------------------------------
        self.section_title("Employee Details", cy)
        cy -= 8*mm

        emp_e_fields = [
            ("Employee Name",              applicant["name"]),
            ("Employee Code",              salary["emp_code"]),
            ("Designation",                salary["designation"]),
            ("Department",                 salary["department"]),
            ("Date of Joining",            salary["doj"]),
            ("PAN",                        applicant["pan"]),
            ("PF Account No.",             salary["pf_no"]),
            ("UAN",                        salary["uan"]),
            ("ESI Number",                 salary.get("esi_no", "N/A")),
            ("Bank Account (Salary)",      applicant["account_no"]),
            ("Grade / Level",              salary.get("grade", "L3")),
            ("Location",                   salary.get("location", "Bengaluru")),
        ]
        for i, (label, val) in enumerate(emp_e_fields):
            col_x = MARGIN if i % 2 == 0 else MARGIN + col_w + 6 * mm
            row_y = cy - (i // 2) * 6.5 * mm
            self.field_row(label, val, col_x, row_y, col_w=col_w)
        cy -= (len(emp_e_fields) // 2 + 1) * 6.5 * mm + 4 * mm

        # ---- EARNINGS TABLE -----------------------------------------
        self.section_title("Earnings & Deductions Statement", cy)
        cy -= 3*mm

        ear_data = [
            ["Earnings Component", "Monthly (₹)", "YTD (₹)", "Deductions Component", "Monthly (₹)", "YTD (₹)"],
        ]
        ytd_m = salary.get("months_completed", random.randint(1, 11))
        for row in salary["earning_rows"]:
            ear_data.append(row)

        col_widths_6 = [55*mm, 22*mm, 22*mm, 55*mm, 22*mm, 22*mm]
        cy = self.draw_table(ear_data, col_widths_6, MARGIN, cy - 1*mm)

        # ---- Gross / Net summary ------------------------------------
        cy -= 3*mm
        gross = salary["gross_pay"]
        net   = salary["net_pay"]

        # Tampering: math_mismatch for risked docs
        displayed_gross = gross
        if is_risked and "math_mismatch" in fraud_flags:
            displayed_gross = gross + random.choice([-500, -1000, 500, 1200, -700])

        summary_data = [
            ["", "", "", "", "", ""],
            ["GROSS PAY", f"₹ {format_inr(displayed_gross)}", f"₹ {format_inr(displayed_gross * ytd_m)}",
             "TOTAL DEDUCTIONS", f"₹ {format_inr(salary['total_deductions'])}", f"₹ {format_inr(salary['total_deductions'] * ytd_m)}"],
            ["", "", "", "", "", ""],
            ["NET PAY (Take Home)", f"₹ {format_inr(net)}", f"₹ {format_inr(net * ytd_m)}", "", "", ""],
        ]

        # Draw summary rows manually
        for ri, row in enumerate(summary_data[1:2]):
            c.setFillColor(CANARA_LIGHT)
            c.rect(MARGIN, cy - 7*mm, w - 2*MARGIN, 7*mm, fill=1, stroke=0)
            c.setStrokeColor(CANARA_BLUE)
            c.setLineWidth(0.5)
            c.rect(MARGIN, cy - 7*mm, w - 2*MARGIN, 7*mm, fill=0, stroke=1)
            cx2 = MARGIN
            for ci, cell in enumerate(row):
                cw2 = col_widths_6[ci]
                c.setFillColor(CANARA_BLUE)
                c.setFont("Helvetica-Bold", 8)
                if is_risked and "tilted_amount" in fraud_flags and ci == 1:
                    TamperingEngine.tilted_amount(c, cx2 + 2*mm, cy - 4.5*mm, str(cell), 8.0)
                elif is_risked and "font_discrepancy" in fraud_flags and ci == 1:
                    TamperingEngine.font_size_discrepancy(c, cx2 + 2*mm, cy - 4.5*mm, str(cell))
                else:
                    c.drawString(cx2 + 2*mm, cy - 4.5*mm, str(cell))
                cx2 += cw2
            cy -= 7*mm

        # Net Pay highlighted
        cy -= 2*mm
        c.setFillColor(CANARA_BLUE)
        c.roundRect(MARGIN, cy - 8*mm, (w - 2*MARGIN) * 0.45, 8*mm, 2, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 9.5)
        c.drawString(MARGIN + 3*mm, cy - 5.5*mm, f"NET PAY:  ₹ {format_inr(net)}")
        c.setFont("Helvetica", 7)
        words = indian_num_words(int(net))
        c.drawString(MARGIN + 3*mm, cy - 10.5*mm, f"Rupees {words} Only")

        if is_risked and "pixel_artifact" in fraud_flags:
            TamperingEngine.pixel_artifact(c, MARGIN + 65*mm, cy - 5*mm)
        if is_risked and "blurred_edge" in fraud_flags:
            TamperingEngine.blurred_edge(c, MARGIN, cy - 5*mm)

        # ================================================================
        #  PAGE 2 – CTC BREAKUP + DECLARATIONS
        # ================================================================
        c.showPage()
        self.draw_watermark()
        self.draw_header(
            branch=applicant["branch"],
            doc_type="PAYROLL SALARY SLIP",
            ref_no=applicant["salary_ref"],
            date_str=salary["pay_date"],
            qr_data=f"CB-SAL2-{applicant['applicant_id']}",
        )
        self.draw_footer(2, 2, applicant["applicant_id"])
        self.draw_seal()

        cy2 = h - 50*mm

        # ---- CTC Annualised breakdown --------------------------------
        self.section_title("CTC – Annual Compensation Structure", cy2)
        cy2 -= 4*mm

        ctc_data = [
            ["Component", "Monthly Amount (₹)", "Annual Amount (₹)", "Remarks"],
            ["Basic Salary",        f"₹ {format_inr(salary['basic'])}",       f"₹ {format_inr(salary['basic']*12)}",       "Taxable"],
            ["HRA",                 f"₹ {format_inr(salary['hra'])}",         f"₹ {format_inr(salary['hra']*12)}",         "Partial Exempt u/s 10(13A)"],
            ["Special Allowance",   f"₹ {format_inr(salary['special_allow'])}", f"₹ {format_inr(salary['special_allow']*12)}", "Fully Taxable"],
            ["Travel Allowance",    f"₹ {format_inr(salary['travel_allow'])}", f"₹ {format_inr(salary['travel_allow']*12)}", "Exempt ₹19,200/yr"],
            ["Medical Allowance",   f"₹ {format_inr(salary['medical_allow'])}", f"₹ {format_inr(salary['medical_allow']*12)}", "Exempt ₹15,000/yr"],
            ["LTA",                 f"₹ {format_inr(salary['lta'])}",         f"₹ {format_inr(salary['lta']*12)}",         "Exempt u/s 10(5)"],
            ["Employer PF",         f"₹ {format_inr(salary['employer_pf'])}", f"₹ {format_inr(salary['employer_pf']*12)}", "12% of Basic"],
            ["Gratuity Provision",  f"₹ {format_inr(salary['gratuity'])}",   f"₹ {format_inr(salary['gratuity']*12)}",   "u/s 10(10)"],
            ["Performance Bonus",   f"₹ {format_inr(salary['bonus']/12)}", f"₹ {format_inr(salary['bonus'])}",      "Paid in April"],
            ["GROSS CTC",           f"₹ {format_inr(salary['ctc']/12)}", f"₹ {format_inr(salary['ctc'])}",         ""],
        ]
        col_w4 = [60*mm, 40*mm, 40*mm, 57*mm]
        cy2 = self.draw_table(ctc_data, col_w4, MARGIN, cy2 - 2*mm)
        cy2 -= 5*mm

        # ---- Statutory Compliance -----------------------------------
        self.section_title("Statutory Compliance Details", cy2)
        cy2 -= 8*mm

        stat_fields = [
            ("Employer GSTN",         salary["gstn"]),
            ("Employer PF Reg. No.",  salary["employer_pf_reg"]),
            ("Employee PF Acc. No.",  salary["pf_no"]),
            ("UAN (Universal Account No.)", salary["uan"]),
            ("ESI Employer Code",     salary.get("esi_employer", "N/A")),
            ("ESI Employee No.",      salary.get("esi_no", "N/A")),
            ("PT (Professional Tax)", f"₹ {salary.get('prof_tax', 200)}/month"),
            ("TDS Deducted (u/s 192)", f"₹ {format_inr(salary.get('tds', 0))}"),
        ]
        col_ws = (w - 2 * MARGIN) / 2 - 3 * mm
        for i, (label, val) in enumerate(stat_fields):
            col_x = MARGIN if i % 2 == 0 else MARGIN + col_ws + 6 * mm
            row_y = cy2 - (i // 2) * 6.5 * mm
            self.field_row(label, val, col_x, row_y, col_w=col_ws)
        cy2 -= (len(stat_fields) // 2 + 1) * 6.5 * mm + 4 * mm

        # ---- Declaration -------------------------------------------
        self.section_title("Employer Declaration", cy2)
        cy2 -= 8*mm
        decl = (
            "This is a computer-generated salary slip and does not require a physical signature. The figures mentioned herein are "
            "accurate as per the company's payroll system and statutory deductions have been made as per the applicable laws "
            "including the Income Tax Act 1961, Employees' Provident Fund & Miscellaneous Provisions Act 1952, Employees' State "
            "Insurance Act 1948, and Payment of Gratuity Act 1972. This document is issued at the request of the employee for "
            "submission to financial institutions and should be treated as strictly confidential."
        )
        c.setFillColor(TEXT_MED)
        c.setFont("Helvetica", 7)
        text_obj = c.beginText(MARGIN, cy2)
        text_obj.setFont("Helvetica", 7)
        text_obj.setFillColor(TEXT_MED)
        for line in textwrap.wrap(decl, width=105):
            text_obj.textLine(line)
        c.drawText(text_obj)
        cy2 -= 20*mm

        self.signature_box(MARGIN, cy2, label="HR Manager")
        self.signature_box(MARGIN + 60*mm, cy2, label="Finance Controller")
        self.signature_box(MARGIN + 120*mm, cy2, label="Director / CFO")

        self.save()


class ITRRenderer(BasePainter):
    """
    Renders an ITR-1 (Sahaj) style Income Tax Return document (2-page).
    """
    def render(self, applicant: dict, is_risked: bool, fraud_flags: list):
        c = self.c
        w, h = PAGE_W, PAGE_H
        itr = applicant["itr"]

        # ================================================================
        #  PAGE 1 – PERSONAL + INCOME DETAILS
        # ================================================================
        self.draw_watermark()
        self.draw_header(
            branch=applicant["branch"],
            doc_type="ITR-1 (SAHAJ) RETURN",
            ref_no=applicant["itr_ref"],
            date_str=itr["filed_date"],
            qr_data=f"CB-ITR-{applicant['applicant_id']}-AY{itr['assessment_year']}",
        )
        self.draw_footer(1, 2, applicant["applicant_id"])
        self.draw_seal()

        cy = h - 50*mm

        # ---- Filing Details -----------------------------------------
        self.section_title(f"ITR-1 SAHAJ – Assessment Year {itr['assessment_year']}", cy)
        cy -= 8*mm

        filing_fields = [
            ("PAN",                     applicant["pan"]),
            ("Assessment Year (AY)",    itr["assessment_year"]),
            ("Previous Year (PY)",      itr["previous_year"]),
            ("Form Type",               "ITR-1 (SAHAJ)"),
            ("Filing Status",           "Original Return"),
            ("Filing Date",             itr["filed_date"]),
            ("Acknowledgement No.",     itr["ack_no"]),
            ("ITD Portal Reference",    itr.get("portal_ref", f"ITRETURN{applicant['pan']}{itr['assessment_year'][:4]}")),
            ("Jurisdiction AO",         itr.get("ao_code", f"ITO Ward-{random.randint(1,12)}(3) Bengaluru")),
            ("Return Type",             "Salary Income – Section 17"),
        ]
        col_w = (w - 2 * MARGIN) / 2 - 3 * mm
        for i, (label, val) in enumerate(filing_fields):
            col_x = MARGIN if i % 2 == 0 else MARGIN + col_w + 6 * mm
            row_y = cy - (i // 2) * 6.5 * mm
            self.field_row(label, val, col_x, row_y, col_w=col_w)
        cy -= (len(filing_fields) // 2 + 1) * 6.5 * mm + 4 * mm

        # ---- Personal Details --------------------------------------
        self.section_title("Part A – General Information", cy)
        cy -= 8*mm

        # Semantic drift: employer name may differ from salary slip
        itr_employer = itr["employer_name"]  # may differ if is_risked + semantic_drift

        personal_fields = [
            ("First Name",              applicant["name"].split()[0]),
            ("Middle Name",             applicant["name"].split()[1] if len(applicant["name"].split()) > 2 else ""),
            ("Last Name",               applicant["name"].split()[-1]),
            ("Date of Birth",           applicant["dob"]),
            ("Gender",                  applicant["gender"]),
            ("Residential Status",      "Resident"),
            ("Mobile No.",              applicant["mobile"]),
            ("Email",                   applicant["email"]),
            ("Aadhaar No. (Masked)",    applicant["aadhaar"]),
            ("Current Address",         applicant["address"][:55]),
            ("Employer Name",           itr_employer),
            ("TAN of Employer",         itr.get("tan", f"BLRE{random.randint(10000,99999)}")),
        ]
        for i, (label, val) in enumerate(personal_fields):
            col_x = MARGIN if i % 2 == 0 else MARGIN + col_w + 6 * mm
            row_y = cy - (i // 2) * 6.5 * mm
            self.field_row(label, val, col_x, row_y, col_w=col_w)
        cy -= (len(personal_fields) // 2 + 1) * 6.5 * mm + 4 * mm

        # ---- Income from Salary ------------------------------------
        self.section_title("Part B – Gross Total Income (Schedule Salary u/s 17)", cy)
        cy -= 4*mm

        gross_income = itr["gross_salary"]
        displayed_income = gross_income
        if is_risked and "math_mismatch" in fraud_flags:
            displayed_income = gross_income + random.choice([-8000, -15000, 12000, 6000])

        inc_data = [
            ["Income Component",            "Amount (₹)",       "Section",   "Exemption/Deduction (₹)", "Taxable (₹)"],
            ["Salary as per 17(1)",          f"₹ {format_inr(itr['salary_17_1'])}",  "17(1)",  "Nil",       f"₹ {format_inr(itr['salary_17_1'])}"],
            ["Value of Perquisites 17(2)",   f"₹ {format_inr(itr['perquisites'])}",  "17(2)",  "Nil",       f"₹ {format_inr(itr['perquisites'])}"],
            ["Profits in lieu of Salary 17(3)", f"₹ {format_inr(itr['profits_lieu'])}", "17(3)", "Nil",    f"₹ {format_inr(itr['profits_lieu'])}"],
            ["HRA Exemption u/s 10(13A)",   "",                                       "10(13A)", f"₹ {format_inr(itr['hra_exempt'])}",    f"- ₹ {format_inr(itr['hra_exempt'])}"],
            ["Standard Deduction u/s 16(ia)", "",                                     "16(ia)",  "₹ 50,000.00",  "- ₹ 50,000.00"],
            ["Professional Tax u/s 16(iii)", "",                                      "16(iii)", f"₹ {format_inr(itr['prof_tax'])}",   f"- ₹ {format_inr(itr['prof_tax'])}"],
            ["GROSS TOTAL SALARY INCOME",    f"₹ {format_inr(displayed_income)}",    "",         "",        f"₹ {format_inr(itr['net_taxable_salary'])}"],
        ]
        col_w5 = [55*mm, 30*mm, 20*mm, 40*mm, 32*mm]
        cy = self.draw_table(inc_data, col_w5, MARGIN, cy - 2*mm)

        if is_risked and "tilted_amount" in fraud_flags:
            TamperingEngine.tilted_amount(c, MARGIN + 58*mm, cy + 7*mm, f"₹ {format_inr(displayed_income)}", 7.5)
        if is_risked and "pixel_artifact" in fraud_flags:
            TamperingEngine.pixel_artifact(c, MARGIN + 57*mm, cy + 5*mm)

        cy -= 4*mm

        # ================================================================
        #  PAGE 2 – DEDUCTIONS + TAX COMPUTATION + VERIFICATION
        # ================================================================
        c.showPage()
        self.draw_watermark()
        self.draw_header(
            branch=applicant["branch"],
            doc_type="ITR-1 (SAHAJ) RETURN",
            ref_no=applicant["itr_ref"],
            date_str=itr["filed_date"],
            qr_data=f"CB-ITR2-{applicant['applicant_id']}",
        )
        self.draw_footer(2, 2, applicant["applicant_id"])
        self.draw_seal()

        cy2 = h - 50*mm

        # ---- Deductions u/s 80 -------------------------------------
        self.section_title("Part C – Deductions u/s 80 & Other Sources", cy2)
        cy2 -= 4*mm

        ded_data = [
            ["Section", "Description",                         "Amount Claimed (₹)", "Eligible Limit (₹)"],
            ["80C",     "LIC / PPF / ELSS / EPF / NSC",        f"₹ {format_inr(itr['ded_80c'])}",    "₹ 1,50,000.00"],
            ["80D",     "Medical Insurance Premium",            f"₹ {format_inr(itr['ded_80d'])}",    "₹ 25,000.00"],
            ["80E",     "Education Loan Interest",              f"₹ {format_inr(itr.get('ded_80e',0))}",  "No Limit"],
            ["80TTA",   "Savings Account Interest",             f"₹ {format_inr(itr.get('ded_80tta',0))}", "₹ 10,000.00"],
            ["80G",     "Donations to Charitable Institutions", f"₹ {format_inr(itr.get('ded_80g',0))}", "50% / 100%"],
            ["Total Deductions Chapter VIA", "",               f"₹ {format_inr(itr['total_deductions_vi'])}", ""],
        ]
        col_w4a = [20*mm, 80*mm, 45*mm, 32*mm]
        cy2 = self.draw_table(ded_data, col_w4a, MARGIN, cy2 - 2*mm)
        cy2 -= 5*mm

        # ---- Tax Computation ----------------------------------------
        self.section_title("Part D – Computation of Tax Liability", cy2)
        cy2 -= 4*mm

        tax_data = [
            ["Particulars",                          "Amount (₹)"],
            ["Gross Total Income (GTI)",              f"₹ {format_inr(itr['net_taxable_salary'])}"],
            ["Less: Deductions Chapter VI-A",         f"₹ {format_inr(itr['total_deductions_vi'])}"],
            ["Total Income (Rounded)",                f"₹ {format_inr(itr['total_income'])}"],
            ["Tax on Total Income (Slab Rates)",      f"₹ {format_inr(itr['tax_on_income'])}"],
            ["Less: Rebate u/s 87A",                  f"₹ {format_inr(itr.get('rebate_87a',0))}"],
            ["Health & Education Cess @ 4%",          f"₹ {format_inr(itr['cess'])}"],
            ["Total Tax Payable",                     f"₹ {format_inr(itr['total_tax'])}"],
            ["Less: TDS Deducted (Form 16)",          f"₹ {format_inr(itr['tds_deducted'])}"],
            ["Net Tax Payable / (Refund)",            f"₹ {format_inr(itr['net_tax_payable'])}"],
        ]
        col_w2 = [100*mm, 77*mm]
        cy2 = self.draw_table(tax_data, col_w2, MARGIN, cy2 - 2*mm)
        cy2 -= 5*mm

        # ---- Bank account for refund --------------------------------
        self.section_title("Refund Bank Account Details", cy2)
        cy2 -= 8*mm
        ref_fields = [
            ("Bank Name",       "Canara Bank"),
            ("Branch",          applicant["branch"][0]),
            ("IFSC Code",       applicant["branch"][1]),
            ("Account Number",  applicant["account_no"]),
            ("Account Type",    "Savings"),
            ("Pre-validated",   "Yes"),
        ]
        col_wrx = (w - 2 * MARGIN) / 2 - 3 * mm
        for i, (label, val) in enumerate(ref_fields):
            col_x = MARGIN if i % 2 == 0 else MARGIN + col_wrx + 6 * mm
            row_y = cy2 - (i // 2) * 6.5 * mm
            self.field_row(label, val, col_x, row_y, col_w=col_wrx)
        cy2 -= (len(ref_fields) // 2 + 1) * 6.5 * mm + 6 * mm

        # ---- Verification -------------------------------------------
        self.section_title("Part E – Verification", cy2)
        cy2 -= 8*mm

        verif_text = (
            "I, the below-named person, being the person named in the above return, verify that the contents of this "
            "return of income are correct and complete to the best of my knowledge and belief and that the return has "
            "been prepared as per the provisions of the Income Tax Act, 1961 and the Rules made thereunder. I further "
            "declare that I am making this return in my capacity as the assessee and I am also competent to make this "
            "return and verify it. I am holding a valid PAN issued under section 139A of the Income Tax Act, 1961."
        )
        c.setFont("Helvetica", 7)
        c.setFillColor(TEXT_MED)
        text_obj = c.beginText(MARGIN, cy2)
        text_obj.setFont("Helvetica", 7)
        text_obj.setFillColor(TEXT_MED)
        for line in textwrap.wrap(verif_text, width=105):
            text_obj.textLine(line)
        c.drawText(text_obj)
        cy2 -= 20*mm

        self.signature_box(MARGIN, cy2, label="Assessee Signature")
        self.signature_box(MARGIN + 70*mm, cy2, label="Date of Verification")
        self.signature_box(MARGIN + 120*mm, cy2, label="E-Verification Code (EVC)")

        self.save()


class LandRecordRenderer(BasePainter):
    """
    Renders a Karnataka-style Record of Rights (RoR) / 7/12 Pahani document (2 pages).
    Includes Survey No., Khasra, Circle Rate Valuation, ownership chain.
    """
    def render(self, applicant: dict, is_risked: bool, fraud_flags: list):
        c = self.c
        w, h = PAGE_W, PAGE_H
        land = applicant["land"]

        # ================================================================
        #  PAGE 1 – PROPERTY DETAILS
        # ================================================================
        self.draw_watermark()
        self.draw_header(
            branch=applicant["branch"],
            doc_type="PROPERTY RECORD OF RIGHTS",
            ref_no=applicant["land_ref"],
            date_str=land["issue_date"],
            qr_data=f"CB-LND-{applicant['applicant_id']}-{land['survey_no']}",
        )
        self.draw_footer(1, 2, applicant["applicant_id"])
        self.draw_seal()

        cy = h - 50*mm

        # ---- Government header -------------------------------------
        c.setFillColor(CANARA_LIGHT)
        c.roundRect(MARGIN, cy - 14*mm, w - 2*MARGIN, 14*mm, 3, fill=1, stroke=0)
        c.setFillColor(CANARA_BLUE)
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(w / 2, cy - 5*mm, "GOVERNMENT OF KARNATAKA – REVENUE DEPARTMENT")
        c.setFont("Helvetica", 8)
        c.setFillColor(TEXT_MED)
        c.drawCentredString(w / 2, cy - 10*mm, "Record of Rights, Tenancy and Crops (RTC / Pahani)  –  Form No. 7/12")
        cy -= 18*mm

        # ---- Property Identification --------------------------------
        self.section_title("Property Identification & Location", cy)
        cy -= 8*mm

        dist_name, taluk_name, circle_rate = land["district_info"]
        prop_fields = [
            ("District",                  dist_name),
            ("Taluk / Sub-District",      taluk_name),
            ("Hobli (Revenue Circle)",    land.get("hobli", f"Hobli-{random.randint(1,5)}")),
            ("Village / Town",            land["village"]),
            ("Survey Number",             land["survey_no"]),
            ("Khasra Number",             land["khasra_no"]),
            ("Hissa Number",              land.get("hissa", f"{random.randint(1,8)}")),
            ("Gat Number (if any)",       land.get("gat_no", "N/A")),
            ("Old Survey No.",            land.get("old_survey", f"{random.randint(100,999)}")),
            ("Village Map Reference",     f"VM/{dist_name[:3].upper()}/{random.randint(100,999)}"),
            ("Classified As",             land["land_type"]),
            ("Land Use Zone",             land.get("zone", "Residential / Agri Conversion")),
        ]
        col_w = (w - 2 * MARGIN) / 2 - 3 * mm
        for i, (label, val) in enumerate(prop_fields):
            col_x = MARGIN if i % 2 == 0 else MARGIN + col_w + 6 * mm
            row_y = cy - (i // 2) * 6.5 * mm
            self.field_row(label, val, col_x, row_y, col_w=col_w)
        cy -= (len(prop_fields) // 2 + 1) * 6.5 * mm + 4 * mm

        # ---- Land Measurements -------------------------------------
        self.section_title("Land Measurement Details", cy)
        cy -= 4*mm

        meas_data = [
            ["Measurement Type", "Value", "Unit", "Converted (Sq. Ft.)", "Converted (Sq. Mt.)"],
            ["Total Extent",     str(land["extent_acres"]),  "Acres",  f"{land['extent_sqft']:,}",  f"{int(land['extent_sqft']*0.0929):,}"],
            ["Survey Extent",    str(round(land["extent_acres"]*0.98, 3)), "Acres", f"{int(land['extent_sqft']*0.98):,}", f"{int(land['extent_sqft']*0.98*0.0929):,}"],
            ["Assessment Area",  str(round(land["extent_acres"]*0.95, 3)), "Acres", f"{int(land['extent_sqft']*0.95):,}", f"{int(land['extent_sqft']*0.95*0.0929):,}"],
        ]
        col_w5 = [45*mm, 25*mm, 20*mm, 45*mm, 42*mm]
        cy = self.draw_table(meas_data, col_w5, MARGIN, cy - 2*mm)
        cy -= 5*mm

        # ---- Ownership Details --------------------------------------
        self.section_title("Ownership / Khatedar Details (Column 3 – RTC)", cy)
        cy -= 4*mm

        own_data = [
            ["Sl.", "Name of Owner / Khatedar", "Father's Name", "Share (%)", "Acquisition Mode", "Date"],
            ["1", applicant["name"], land["father_name"], "100%", land["acquisition_mode"], land["acquisition_date"]],
        ]
        col_w6 = [10*mm, 55*mm, 45*mm, 18*mm, 37*mm, 25*mm]
        cy = self.draw_table(own_data, col_w6, MARGIN, cy - 2*mm)
        cy -= 5*mm

        # ---- Encumbrance / Liabilities ------------------------------
        self.section_title("Encumbrance & Liabilities (Column 11)", cy)
        cy -= 4*mm

        enc_data = [
            ["Type of Liability", "Financial Institution", "Loan Account No.", "Amount (₹)", "Date of Mortgage", "Status"],
            ["Equitable Mortgage", "Canara Bank", applicant.get("loan_ref", rand_loan_ref()),
             f"₹ {format_inr(applicant.get('loan_amount', land['market_value']*0.6))}",
             applicant["doc_date"], "Active"],
        ]
        col_w6b = [32*mm, 35*mm, 35*mm, 28*mm, 28*mm, 19*mm]
        cy = self.draw_table(enc_data, col_w6b, MARGIN, cy - 2*mm)

        # ================================================================
        #  PAGE 2 – VALUATION + MUTATION + GOVT NOTES
        # ================================================================
        c.showPage()
        self.draw_watermark()
        self.draw_header(
            branch=applicant["branch"],
            doc_type="PROPERTY RECORD OF RIGHTS",
            ref_no=applicant["land_ref"],
            date_str=land["issue_date"],
            qr_data=f"CB-LND2-{applicant['applicant_id']}",
        )
        self.draw_footer(2, 2, applicant["applicant_id"])
        self.draw_seal()

        cy2 = h - 50*mm

        # ---- Circle Rate Valuation -----------------------------------
        self.section_title("Sub-Registrar Circle Rate Valuation (Stamp Duty Basis)", cy2)
        cy2 -= 8*mm

        market_val = land["market_value"]
        stamp_val  = land.get("stamp_val", market_val * 0.9)

        val_fields = [
            ("Circle Rate (Guidance Value)",     f"₹ {format_inr(circle_rate)}/Sq. Ft."),
            ("Property Extent (Sq. Ft.)",        f"{land['extent_sqft']:,}"),
            ("Circle Rate Valuation",            f"₹ {format_inr(circle_rate * land['extent_sqft'])}"),
            ("Declared Market Value",            f"₹ {format_inr(market_val)}"),
            ("Value Adopted for Stamp Duty",     f"₹ {format_inr(stamp_val)}"),
            ("Stamp Duty Paid (@ 5%)",           f"₹ {format_inr(stamp_val * 0.05)}"),
            ("Registration Charges (@ 1%)",     f"₹ {format_inr(stamp_val * 0.01)}"),
            ("Document No. (Reg. Office)",       land.get("doc_reg_no", f"DOC-{random.randint(1000,9999)}/2023-24")),
            ("Sub-Registrar Office",             f"SRO {dist_name}"),
            ("Date of Registration",             land.get("reg_date", land["acquisition_date"])),
        ]
        col_wv = (w - 2 * MARGIN) / 2 - 3 * mm
        for i, (label, val) in enumerate(val_fields):
            col_x = MARGIN if i % 2 == 0 else MARGIN + col_wv + 6 * mm
            row_y = cy2 - (i // 2) * 6.5 * mm
            self.field_row(label, val, col_x, row_y, col_w=col_wv, value_bold=(i % 2 == 1 and "Value" in label))
        cy2 -= (len(val_fields) // 2 + 1) * 6.5 * mm + 4 * mm

        # ---- Mutation History ---------------------------------------
        self.section_title("Mutation Register (Column 9 – RTC)", cy2)
        cy2 -= 4*mm

        mut_data = [
            ["Mutation No.", "Date", "From Owner", "To Owner", "Mode", "Remarks"],
            [land.get("mutation_no", f"MUT/{random.randint(1000,9999)}/23-24"),
             land["acquisition_date"], land["seller_name"], applicant["name"],
             land["acquisition_mode"], "Completed"],
        ]
        col_w6c = [28*mm, 22*mm, 45*mm, 45*mm, 22*mm, 25*mm]
        cy2 = self.draw_table(mut_data, col_w6c, MARGIN, cy2 - 2*mm)
        cy2 -= 5*mm

        # ---- Crop / Agricultural details (Column 12) ----------------
        self.section_title("Crop & Agricultural Details (Column 12 – If Applicable)", cy2)
        cy2 -= 4*mm

        crop_data = [
            ["Season", "Crop Grown", "Irrigated / Dry", "Area (Acres)", "Water Source"],
            ["Kharif (Jun–Nov)", land.get("kharif_crop", "Paddy / Ragi"),
             "Irrigated", str(round(land["extent_acres"] * 0.6, 2)), "Borewell / Canal"],
            ["Rabi (Nov–Mar)",   land.get("rabi_crop", "Wheat / Jowar"),
             "Dry",       str(round(land["extent_acres"] * 0.4, 2)), "Rainwater"],
        ]
        col_w5b = [28*mm, 50*mm, 35*mm, 28*mm, 36*mm]
        cy2 = self.draw_table(crop_data, col_w5b, MARGIN, cy2 - 2*mm)
        cy2 -= 5*mm

        # ---- Issuing Authority Declaration --------------------------
        self.section_title("Issuing Authority Certificate", cy2)
        cy2 -= 8*mm

        cert_text = (
            f"Certified that the above RTC extract has been generated from the Bhoomi Online Land Records Management "
            f"System of the Government of Karnataka. The particulars mentioned herein pertain to Survey No. {land['survey_no']}, "
            f"Village: {land['village']}, Taluk: {taluk_name}, District: {dist_name}. This extract is valid for submission "
            f"to financial institutions and courts as per the Karnataka Land Revenue Act, 1964 and the Karnataka Bhoomi Act. "
            f"Reference: Bhoomi Portal Extract ID: BHOOMI-{random.randint(1000000,9999999)}"
        )
        c.setFont("Helvetica", 7)
        c.setFillColor(TEXT_MED)
        text_obj = c.beginText(MARGIN, cy2)
        text_obj.setFont("Helvetica", 7)
        text_obj.setFillColor(TEXT_MED)
        for line in textwrap.wrap(cert_text, width=105):
            text_obj.textLine(line)
        c.drawText(text_obj)
        cy2 -= 20*mm

        self.signature_box(MARGIN, cy2, label="Village Accountant (VA)")
        self.signature_box(MARGIN + 65*mm, cy2, label="Revenue Inspector (RI)")
        self.signature_box(MARGIN + 120*mm, cy2, label="Tahsildar / Sub-Divisional Officer")

        if is_risked and "noise_stripe" in fraud_flags:
            TamperingEngine.noise_stripe(c, h * 0.55)
        if is_risked and "blurred_edge" in fraud_flags:
            TamperingEngine.blurred_edge(c, MARGIN, cy2 + 40*mm)

        self.save()


# =========================================================================
#  DATA GENERATOR
# =========================================================================

def generate_applicant_data(is_risked: bool) -> dict:
    """
    Generate a full, internally consistent applicant data dictionary.
    When is_risked=True, certain fields are intentionally corrupted
    to simulate fraud scenarios.
    """
    # ---- Identity core -----------------------------------------------
    gender   = random.choice(["Male", "Female"])
    if gender == "Male":
        name = fake.name_male()
    else:
        name = fake.name_female()

    dob_dt   = fake.date_of_birth(minimum_age=25, maximum_age=58)
    dob      = dob_dt.strftime("%d/%m/%Y")
    pan      = rand_pan()
    aadhaar  = rand_aadhaar()
    address  = fake_address()
    branch   = random.choice(BANK_BRANCHES)
    mobile   = "9" + "".join(random.choices("0123456789", k=9))
    email    = (name.split()[0].lower() + str(random.randint(10, 999)) +
                random.choice(["@gmail.com", "@yahoo.com", "@hotmail.com",
                                "@outlook.com", "@rediffmail.com"]))
    account_no = rand_account()
    voter_id   = ("".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZ", k=3)) +
                  "".join(random.choices("0123456789", k=7)))
    uid        = rand_aadhaar().replace("XXXX XXXX ", "").strip()
    uid        = f"{''.join(random.choices('0123456789', k=4))} {''.join(random.choices('0123456789', k=4))} {uid}"

    # ---- Salary -------------------------------------------------------
    ctc_annual   = random.randint(400000, 2200000)
    basic        = int(ctc_annual * 0.40 / 12)
    hra          = int(basic * 0.50)
    special_allow = int(basic * 0.20)
    travel_allow  = 1600
    medical_allow = 1250
    lta           = int(basic * 0.10)
    employer_pf   = int(basic * 0.12)
    gratuity      = int(basic * 4.81 / 100)
    bonus_annual  = int(ctc_annual * 0.08)

    gross_pay = basic + hra + special_allow + travel_allow + medical_allow + lta
    employee_pf   = int(basic * 0.12)
    prof_tax      = 200
    esi_monthly   = int(gross_pay * 0.0075) if gross_pay < 21000 else 0
    tds_monthly   = max(0, int((ctc_annual * 0.30 - 50000) / 12)) if ctc_annual > 700000 else 0
    total_deductions = employee_pf + prof_tax + tds_monthly + esi_monthly
    net_pay       = gross_pay - total_deductions
    ctc_monthly   = gross_pay + employer_pf + gratuity + int(bonus_annual / 12)

    emp_pair = random.choice(EMPLOYERS)
    employer_name_salary = emp_pair[0]
    employer_name_itr    = emp_pair[1] if is_risked else emp_pair[0]   # Semantic drift

    emp_addr = (f"{random.randint(1,100)}, {random.choice(['MG Road','Brigade Road','Residency Road','Cunningham Road'])}, "
                f"Bengaluru – {random.choice(['560001','560002','560025','560038'])}")

    gstn         = rand_gstn()
    pf_no        = rand_pf()
    uan          = rand_uan()
    esi_no       = rand_esi() if esi_monthly > 0 else "Not Applicable"
    employer_pf_reg = f"KA/BNE/{random.randint(10000,99999)}"
    emp_code      = "EMP" + "".join(random.choices("0123456789", k=6))
    designations  = ["Software Engineer", "Senior Engineer", "Team Lead", "Project Manager",
                     "Analyst", "Associate Consultant", "Deputy Manager", "Manager",
                     "Senior Analyst", "Technical Architect"]
    designation   = random.choice(designations)
    departments   = ["IT – Application Development", "IT – Infrastructure", "Finance & Accounts",
                     "Human Resources", "Operations", "Sales & Marketing", "Legal & Compliance"]
    department    = random.choice(departments)
    doj_dt        = dob_dt + timedelta(days=random.randint(365*3, 365*20))
    if doj_dt > date.today():
        doj_dt = date.today() - timedelta(days=random.randint(365, 365*5))
    doj           = doj_dt.strftime("%d/%m/%Y")

    months_completed = random.randint(1, 11)
    month_names = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"]
    month_idx   = random.randint(0, 11)
    pay_year    = random.randint(2022, 2024)
    month_year  = f"{month_names[month_idx]} {pay_year}"
    pay_date_dt = date(pay_year, month_idx + 1, random.randint(28, 28))
    pay_date    = pay_date_dt.strftime("%d/%m/%Y")

    working_days = random.randint(22, 26)

    # Earning rows for salary table
    earning_rows = [
        ["Basic Salary",           f"₹ {format_inr(basic)}",        f"₹ {format_inr(basic*months_completed)}",
         "Employee PF (12% Basic)", f"₹ {format_inr(employee_pf)}", f"₹ {format_inr(employee_pf*months_completed)}"],
        ["House Rent Allowance",   f"₹ {format_inr(hra)}",          f"₹ {format_inr(hra*months_completed)}",
         "Professional Tax",       f"₹ {format_inr(prof_tax)}",     f"₹ {format_inr(prof_tax*months_completed)}"],
        ["Special Allowance",      f"₹ {format_inr(special_allow)}",f"₹ {format_inr(special_allow*months_completed)}",
         "TDS (u/s 192)",          f"₹ {format_inr(tds_monthly)}",  f"₹ {format_inr(tds_monthly*months_completed)}"],
        ["Travel Allowance",       f"₹ {format_inr(travel_allow)}", f"₹ {format_inr(travel_allow*months_completed)}",
         "ESI (0.75%)",            f"₹ {format_inr(esi_monthly)}",  f"₹ {format_inr(esi_monthly*months_completed)}"],
        ["Medical Allowance",      f"₹ {format_inr(medical_allow)}",f"₹ {format_inr(medical_allow*months_completed)}",
         "",                       "",                               ""],
        ["Leave Travel Allowance", f"₹ {format_inr(lta)}",          f"₹ {format_inr(lta*months_completed)}",
         "",                       "",                               ""],
    ]

    # ---- ITR ----------------------------------------------------------
    salary_17_1  = gross_pay * 12
    perquisites  = int(ctc_annual * 0.01)
    profits_lieu = 0
    hra_exempt   = min(hra * 12, int(salary_17_1 * 0.40))
    gross_salary = salary_17_1 + perquisites
    std_ded      = 50000
    prof_tax_yr  = prof_tax * 12
    net_taxable_sal = gross_salary - hra_exempt - std_ded - prof_tax_yr

    ded_80c  = min(random.randint(50000, 150000), 150000)
    ded_80d  = min(random.randint(5000, 25000), 25000)
    ded_80e  = random.randint(0, 50000)
    ded_80tta = min(random.randint(0, 10000), 10000)
    ded_80g  = random.randint(0, 10000)
    total_ded_vi = ded_80c + ded_80d + ded_80e + ded_80tta + ded_80g

    total_income = max(0, net_taxable_sal - total_ded_vi)
    # Simplified slab calculation
    if total_income <= 300000:
        tax_on_income = 0
    elif total_income <= 600000:
        tax_on_income = int((total_income - 300000) * 0.05)
    elif total_income <= 900000:
        tax_on_income = 15000 + int((total_income - 600000) * 0.10)
    elif total_income <= 1200000:
        tax_on_income = 45000 + int((total_income - 900000) * 0.15)
    elif total_income <= 1500000:
        tax_on_income = 90000 + int((total_income - 1200000) * 0.20)
    else:
        tax_on_income = 150000 + int((total_income - 1500000) * 0.30)

    rebate_87a = tax_on_income if total_income <= 700000 else 0
    tax_after  = max(0, tax_on_income - rebate_87a)
    cess       = int(tax_after * 0.04)
    total_tax  = tax_after + cess
    tds_deducted = tds_monthly * 12
    net_tax_payable = total_tax - tds_deducted

    ay         = f"{pay_year}-{str(pay_year+1)[2:]}"
    prev_year  = f"{pay_year-1}-{str(pay_year)[2:]}"
    filed_date_dt = date(pay_year + 1, random.randint(6, 7), random.randint(1, 28))
    try:
        filed_date = filed_date_dt.strftime("%d/%m/%Y")
    except:
        filed_date = f"31/07/{pay_year+1}"

    ack_no = ("".join(random.choices("0123456789", k=15)))

    # ---- Land ---------------------------------------------------------
    dist_info    = random.choice(DISTRICTS_KA)
    extent_acres = round(random.uniform(0.5, 8.0), 2)
    extent_sqft  = int(extent_acres * 43560)
    circle_rate  = dist_info[2]
    market_value = int(extent_sqft * circle_rate * random.uniform(1.0, 1.4))

    villages = ["Hegganahalli", "Yelahanka New Town", "Devanahalli", "Hoskote",
                "Ramanagaram", "Channapatna", "Kanakapura", "Magadi",
                "Doddaballapur", "Nelamangala"]
    land_types = ["Agricultural Land", "Converted Land (Section 95)", "Residential Plot",
                  "Commercial Plot", "Agri-Horticulture Land"]
    acq_modes  = ["Sale Deed", "Gift Deed", "Partition Deed", "Inheritance",
                  "Government Allotment"]

    issue_dt    = date.today() - timedelta(days=random.randint(1, 60))
    acq_dt      = date(random.randint(2010, 2022), random.randint(1, 12), random.randint(1, 28))
    father_name = fake.name_male()
    seller_name = fake.name_male()

    # ---- Reference numbers / dates ----------------------------------
    doc_date   = date.today().strftime("%d/%m/%Y")
    app_id_num = random.randint(10000000, 99999999)
    applicant_id = f"CBLP{app_id_num}"

    identity_ref = f"CB/KYC/{applicant_id}/{''.join(random.choices('0123456789',k=6))}"
    salary_ref   = f"CB/SAL/{applicant_id}/{pay_year}/{month_idx+1:02d}"
    itr_ref      = f"CB/ITR/{applicant_id}/AY{ay.replace('-','')}"
    land_ref     = f"CB/LND/{applicant_id}/{''.join(random.choices('0123456789',k=8))}"

    # ---- Metadata producer (forensic marker) ------------------------
    if is_risked:
        producer = random.choice(["Adobe Photoshop CC 2024", "Adobe Photoshop CS6",
                                  "Adobe Acrobat Pro DC", "GIMP 2.10"])
        creator  = random.choice(["Adobe Photoshop CC 2024", "Adobe Illustrator 2023"])
    else:
        producer = "Canara-Core-System v4.1.2"
        creator  = "Canara-Core-System v4.1.2"

    return {
        # Identity
        "applicant_id": applicant_id,
        "name":         name,
        "dob":          dob,
        "gender":       gender,
        "pan":          pan,
        "aadhaar":      aadhaar,
        "uid":          uid,
        "address":      address,
        "mobile":       mobile,
        "email":        email,
        "voter_id":     voter_id,
        "account_no":   account_no,
        "branch":       branch,
        "doc_date":     doc_date,
        "identity_ref": identity_ref,
        "salary_ref":   salary_ref,
        "itr_ref":      itr_ref,
        "land_ref":     land_ref,
        "loan_ref":     rand_loan_ref(),
        "loan_amount":  market_value * 0.6,
        "producer":     producer,
        "creator":      creator,

        # Salary
        "salary": {
            "employer_name":    employer_name_salary,
            "employer_address": emp_addr,
            "gstn":             gstn,
            "cin":              f"U72900KA{random.randint(2000,2015)}PLC{random.randint(100000,999999)}",
            "hr_email":         f"hr@{employer_name_salary.lower().split()[0]}.com",
            "emp_code":         emp_code,
            "designation":      designation,
            "department":       department,
            "doj":              doj,
            "pf_no":            pf_no,
            "uan":              uan,
            "esi_no":           esi_no,
            "esi_employer":     f"51000{random.randint(10000,99999)}",
            "employer_pf_reg":  employer_pf_reg,
            "pay_date":         pay_date,
            "month_year":       month_year,
            "working_days":     working_days,
            "lop":              random.choice([0, 0, 0, 1, 2]),
            "basic":            basic,
            "hra":              hra,
            "special_allow":    special_allow,
            "travel_allow":     travel_allow,
            "medical_allow":    medical_allow,
            "lta":              lta,
            "employer_pf":      employer_pf,
            "gratuity":         gratuity,
            "bonus":            bonus_annual,
            "ctc":              ctc_annual,
            "gross_pay":        gross_pay,
            "net_pay":          net_pay,
            "total_deductions": total_deductions,
            "employee_pf":      employee_pf,
            "prof_tax":         prof_tax,
            "tds":              tds_monthly,
            "earning_rows":     earning_rows,
            "months_completed": months_completed,
            "grade":            random.choice(["L1","L2","L3","L4","M1","M2","M3"]),
            "location":         random.choice(["Bengaluru", "Hyderabad", "Pune", "Chennai", "Mumbai"]),
        },

        # ITR
        "itr": {
            "assessment_year":     ay,
            "previous_year":       prev_year,
            "filed_date":          filed_date,
            "ack_no":              ack_no,
            "portal_ref":          f"ITRETURN{pan}{ay[:4]}",
            "ao_code":             f"ITO Ward-{random.randint(1,15)}({random.randint(1,4)}) Bengaluru",
            "employer_name":       employer_name_itr,
            "tan":                 f"BLRE{random.randint(10000,99999)}",
            "salary_17_1":         salary_17_1,
            "perquisites":         perquisites,
            "profits_lieu":        profits_lieu,
            "hra_exempt":          hra_exempt,
            "gross_salary":        gross_salary,
            "net_taxable_salary":  net_taxable_sal,
            "ded_80c":             ded_80c,
            "ded_80d":             ded_80d,
            "ded_80e":             ded_80e,
            "ded_80tta":           ded_80tta,
            "ded_80g":             ded_80g,
            "total_deductions_vi": total_ded_vi,
            "total_income":        total_income,
            "tax_on_income":       tax_on_income,
            "rebate_87a":          rebate_87a,
            "cess":                cess,
            "total_tax":           total_tax,
            "tds_deducted":        tds_deducted,
            "net_tax_payable":     net_tax_payable,
            "prof_tax":            prof_tax_yr,
        },

        # Land
        "land": {
            "district_info":    dist_info,
            "village":          random.choice(villages),
            "hobli":            f"Hobli-{random.randint(1,5)}",
            "survey_no":        rand_survey(),
            "khasra_no":        rand_khasra(),
            "hissa":            str(random.randint(1, 8)),
            "gat_no":           f"G{random.randint(1000,9999)}",
            "old_survey":       str(random.randint(100, 999)),
            "land_type":        random.choice(land_types),
            "zone":             random.choice(["Residential", "Agri Conversion", "Commercial", "Mixed Use"]),
            "extent_acres":     extent_acres,
            "extent_sqft":      extent_sqft,
            "market_value":     market_value,
            "stamp_val":        int(market_value * 0.9),
            "doc_reg_no":       f"DOC-{random.randint(1000,9999)}/{pay_year-1}-{str(pay_year)[2:]}",
            "reg_date":         acq_dt.strftime("%d/%m/%Y"),
            "father_name":      father_name,
            "seller_name":      seller_name,
            "acquisition_mode": random.choice(acq_modes),
            "acquisition_date": acq_dt.strftime("%d/%m/%Y"),
            "mutation_no":      f"MUT/{random.randint(1000,9999)}/{pay_year-1}-{str(pay_year)[2:]}",
            "kharif_crop":      random.choice(["Paddy","Ragi","Maize","Jowar"]),
            "rabi_crop":        random.choice(["Wheat","Jowar","Bajra","Groundnut"]),
            "issue_date":       issue_dt.strftime("%d/%m/%Y"),
        },
    }


# =========================================================================
#  FRAUD FLAG RESOLVER
# =========================================================================

FRAUD_TYPES = [
    "math_mismatch",       # Salary: basic+hra+allow != gross
    "metadata_poisoning",  # Producer = Adobe Photoshop
    "semantic_drift",      # Employer name differs salary <-> ITR
    "pixel_artifact",      # 2-px black artifact near income
    "blurred_edge",        # Blurred edge near amount fields
    "tilted_amount",       # 0.5-degree rotation on amount text
    "font_discrepancy",    # Income field in slightly different size
    "noise_stripe",        # Faint horizontal noise stripe
]

def pick_fraud_flags(is_risked: bool) -> list:
    """
    For risked docs: pick 2–5 fraud types (always include metadata_poisoning).
    For safe docs: empty list.
    """
    if not is_risked:
        return []
    base = ["metadata_poisoning", "semantic_drift"]
    extra = random.sample([f for f in FRAUD_TYPES if f not in base],
                          k=random.randint(2, 4))
    return base + extra


# =========================================================================
#  DOSSIER FACTORY
# =========================================================================

class DossierFactory:
    """
    Generates complete synthetic applicant dossier packets for fraud
    detection model training.

    Usage:
        factory = DossierFactory(base_dir="dataset", n_per_class=1000)
        factory.generate_all(verbose=True)
    """

    def __init__(self, base_dir: str = "dataset", n_per_class: int = 1000):
        self.base_dir    = Path(base_dir)
        self.n_per_class = n_per_class
        self._ensure_dirs()

    # ------------------------------------------------------------------ #

    def _ensure_dirs(self):
        for cls in ("safe", "risked"):
            (self.base_dir / cls).mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ #

    def _applicant_dir(self, cls: str, idx: int) -> Path:
        folder = self.base_dir / cls / f"applicant_{idx:04d}"
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    # ------------------------------------------------------------------ #

    def _make_metadata(self, applicant: dict, is_risked: bool) -> dict:
        """Build PDF metadata dict (forensic marker)."""
        return {
            "title":    f"Canara Bank – Document Packet {applicant['applicant_id']}",
            "author":   "Canara Bank",
            "subject":  "Loan Application Supporting Document",
            "creator":  applicant["creator"],
            "producer": applicant["producer"],
        }

    # ------------------------------------------------------------------ #

    def generate_packet(self, cls: str, idx: int) -> dict:
        """
        Generate one complete 4-document dossier.
        Returns the manifest dict.
        """
        is_risked   = (cls == "risked")
        fraud_flags = pick_fraud_flags(is_risked)
        applicant   = generate_applicant_data(is_risked)
        out_dir     = self._applicant_dir(cls, idx)
        metadata    = self._make_metadata(applicant, is_risked)

        # ---- 1. Identity PDF ----------------------------------------
        IdentityDocRenderer(
            str(out_dir / "identity.pdf"), metadata
        ).render(applicant, is_risked, fraud_flags)

        # ---- 2. Salary PDF ------------------------------------------
        SalarySlipRenderer(
            str(out_dir / "salary.pdf"), metadata
        ).render(applicant, is_risked, fraud_flags)

        # ---- 3. ITR PDF ---------------------------------------------
        ITRRenderer(
            str(out_dir / "itr.pdf"), metadata
        ).render(applicant, is_risked, fraud_flags)

        # ---- 4. Land Record PDF -------------------------------------
        LandRecordRenderer(
            str(out_dir / "land_record.pdf"), metadata
        ).render(applicant, is_risked, fraud_flags)

        # ---- Manifest -----------------------------------------------
        manifest = {
            "applicant_id":   applicant["applicant_id"],
            "class":          cls,
            "is_risked":      is_risked,
            "fraud_flags":    fraud_flags,
            "fraud_reason":   ", ".join(fraud_flags) if fraud_flags else "none",
            "name":           applicant["name"],
            "pan":            applicant["pan"],
            "doc_date":       applicant["doc_date"],
            "branch_ifsc":    applicant["branch"][1],
            "salary_gross":   applicant["salary"]["gross_pay"],
            "salary_net":     applicant["salary"]["net_pay"],
            "itr_total_income": applicant["itr"]["total_income"],
            "land_value":     applicant["land"]["market_value"],
            "pdf_producer":   applicant["producer"],
            "files": {
                "identity":    "identity.pdf",
                "salary":      "salary.pdf",
                "itr":         "itr.pdf",
                "land_record": "land_record.pdf",
            },
        }

        with open(out_dir / "manifest.json", "w") as f:
            json.dump(manifest, f, indent=2)

        return manifest

    # ------------------------------------------------------------------ #

    def generate_all(self, verbose: bool = True):
        """Generate n_per_class dossiers for both safe and risked classes."""
        total      = self.n_per_class * 2
        generated  = 0
        manifests  = []

        for cls in ("safe", "risked"):
            for idx in range(1, self.n_per_class + 1):
                try:
                    m = self.generate_packet(cls, idx)
                    manifests.append(m)
                    generated += 1
                    if verbose and generated % 50 == 0:
                        pct = generated / total * 100
                        print(f"  [{pct:5.1f}%]  Generated {generated}/{total} "
                              f"({cls} applicant_{idx:04d})")
                except Exception as e:
                    print(f"  [ERROR]  {cls}/applicant_{idx:04d}: {e}")

        # ---- Master index -------------------------------------------
        master = {
            "dataset_version": "2.0",
            "total_packets":   generated,
            "safe_count":      sum(1 for m in manifests if not m["is_risked"]),
            "risked_count":    sum(1 for m in manifests if m["is_risked"]),
            "fraud_type_distribution": {},
            "packets":         manifests,
        }
        # Count fraud type occurrences
        for m in manifests:
            for ff in m["fraud_flags"]:
                master["fraud_type_distribution"][ff] = \
                    master["fraud_type_distribution"].get(ff, 0) + 1

        with open(self.base_dir / "dataset_index.json", "w") as f:
            json.dump(master, f, indent=2)

        if verbose:
            print(f"\n{'='*60}")
            print(f"  AEGIS DOSSIER FACTORY — Generation Complete")
            print(f"{'='*60}")
            print(f"  Total packets : {generated}")
            print(f"  Safe          : {master['safe_count']}")
            print(f"  Risked        : {master['risked_count']}")
            print(f"  Output dir    : {self.base_dir.resolve()}")
            print(f"  Master index  : {self.base_dir / 'dataset_index.json'}")
            print(f"{'='*60}")

        return manifests


# =========================================================================
#  ENTRY POINT
# =========================================================================

if __name__ == "__main__":
    import sys

    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1000

    print(f"\n{'='*60}")
    print(f"  AEGIS DOSSIER FACTORY  v2.0")
    print(f"  Generating {n} safe + {n} risked applicant packets ...")
    print(f"{'='*60}\n")

    factory = DossierFactory(base_dir="realistic document", n_per_class=n)
    factory.generate_all(verbose=True)

