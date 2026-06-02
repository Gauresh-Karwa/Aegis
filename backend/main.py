from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from pipeline import ForensicEngine
from models import AnalysisResponse

# Load env variables (like Anthropic API Key)
load_dotenv()

app = FastAPI(
    title="Aegis Document Forensics API",
    description="8-Layer Real-Time Document Forensics engine",
    version="1.0.0"
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_CONTENT_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/jpg"}

# Instantiate the refactored engine
engine = ForensicEngine()

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_document(file: UploadFile = File(...)):
    """
    Ingests a document and runs the 8-layer Aegis pipeline.
    """
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported file type: {file.content_type}. Must be pdf, png, or jpeg."
        )

    try:
        file_bytes = await file.read()
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")
         
    # Run the full pipeline via the engine
    result = engine.run(file_bytes, file.filename)
    
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
