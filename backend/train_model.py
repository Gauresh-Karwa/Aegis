import pandas as pd
import json

def train_model():
    print("Loading forensic_training_data.xls...")
    df = pd.read_csv('forensic_training_data.xls')
    
    # Calculate baseline stats for normal vs fraud
    genuine = df[df['is_fraud'] == 0]
    fraud = df[df['is_fraud'] == 1]
    
    stats = {
        "genuine": {
            "ip_velocity_mean": float(genuine['ip_velocity'].mean()),
            "device_linkage_mean": float(genuine['device_linkage'].mean()),
            "inquiry_velocity_mean": float(genuine['inquiry_velocity'].mean()),
            "balance_volatility_mean": float(genuine['balance_volatility'].mean()),
            "ocr_confidence_mean": float(genuine['ocr_confidence'].mean())
        },
        "fraud": {
            "ip_velocity_mean": float(fraud['ip_velocity'].mean()),
            "device_linkage_mean": float(fraud['device_linkage'].mean()),
            "inquiry_velocity_mean": float(fraud['inquiry_velocity'].mean()),
            "balance_volatility_mean": float(fraud['balance_volatility'].mean()),
            "ocr_confidence_mean": float(fraud['ocr_confidence'].mean())
        }
    }
    
    with open('baseline_stats.json', 'w') as f:
        json.dump(stats, f, indent=4)
        
    print("Model trained! Saved to baseline_stats.json.")

if __name__ == "__main__":
    train_model()
