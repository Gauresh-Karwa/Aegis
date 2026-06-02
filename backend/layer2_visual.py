from models import LayerResult
from PIL import Image, ImageChops
import io
import piexif

def process(file_bytes: bytes, filename: str) -> LayerResult:
    """
    Layer 2: Visual Forensics
    Applies Error Level Analysis (ELA) and Metadata extraction.
    """
    flags = []
    score = 0
    details = {}

    lower_name = filename.lower()
    is_image = lower_name.endswith(('.jpg', '.jpeg', '.png'))
    
    if not is_image:
        # Skip ELA for PDFs in this simple prototype (would use pdf2image normally)
        return LayerResult(
            status="skipped",
            score=0,
            flagged=False,
            details={"reason": "Visual forensics requires image files in this prototype."},
            flags=["Visual checks skipped for non-image format."]
        )

    try:
        # Load image
        original = Image.open(io.BytesIO(file_bytes))
        
        # EXIF Metadata extraction
        exif_dict = None
        if "exif" in original.info:
            exif_dict = piexif.load(original.info["exif"])
            if exif_dict and "0th" in exif_dict and piexif.ImageIFD.Software in exif_dict["0th"]:
                software = exif_dict["0th"][piexif.ImageIFD.Software].decode("utf-8")
                details["authoring_software"] = software
                if any(tool in software.lower() for tool in ["photoshop", "gimp", "canva", "illustrator"]):
                    flags.append(f"Image was edited using graphic design software: {software}")
                    score += 40

        # ELA (Error Level Analysis) Mock
        # Real ELA requires re-saving at known quality and comparing.
        # We will do a basic re-save and diff just to demonstrate the logic.
        temp_io = io.BytesIO()
        original.convert('RGB').save(temp_io, 'JPEG', quality=90)
        temp_io.seek(0)
        resaved = Image.open(temp_io)
        
        diff = ImageChops.difference(original.convert('RGB'), resaved)
        extrema = diff.getextrema()
        max_diff = max([ex[1] for ex in extrema])
        
        details["ela_max_diff"] = max_diff
        
        # In a real scenario, this threshold is tuned
        if max_diff > 50:
             flags.append("Error Level Analysis (ELA) detected potential local pixel manipulation.")
             score += 30

    except Exception as e:
        flags.append(f"Visual processing error: {str(e)}")
        score += 10
        details["error"] = str(e)

    return LayerResult(
        status="complete",
        score=score,
        flagged=len(flags) > 0,
        flags=flags,
        details=details
    )
