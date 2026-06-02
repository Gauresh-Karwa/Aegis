import asyncio
from pipeline import ForensicEngine
import json

def test_pipeline():
    engine = ForensicEngine()
    # Read a genuine PDF
    with open(r"C:\Hackathon\Aegis\Aegis dataset\data_genuine_0.pdf", "rb") as f:
        file_bytes = f.read()
    
    print("Running engine...")
    try:
        response = engine.run(file_bytes, "test.pdf")
        print("Success!")
        print(response.json())
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_pipeline()
