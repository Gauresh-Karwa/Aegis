import requests
import json
import base64

manifest = {
    "applicant_id": "test_app_123",
    "name": "John Doe",
    "pan": "ABCDE1234F",
    "salary_gross": 100000,
    "salary_net": 70000,
    "land_value": 500000
}

files = [
    ("files", ("manifest.json", json.dumps(manifest), "application/json"))
]

try:
    print("First request...")
    res1 = requests.post("http://localhost:8000/analyze", files=files)
    print("Response 1:", res1.status_code, res1.text[:200])

    files = [
        ("files", ("manifest.json", json.dumps(manifest), "application/json"))
    ]
    print("Second request...")
    res2 = requests.post("http://localhost:8000/analyze", files=files)
    print("Response 2:", res2.status_code, res2.text[:200])
except Exception as e:
    print("Request failed:", e)
