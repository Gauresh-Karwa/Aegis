import os
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model

MODEL_PATH = os.path.join(os.path.dirname(__file__), "aegis_output", "aegis_model_v1.keras")

def fine_tune_model(images_dict, scaled_meta, predicted_label):
    """
    Performs a micro-batch gradient update on the model.
    This enables Continuous Active Learning as the model encounters new cases.
    """
    if not os.path.exists(MODEL_PATH):
        print(f"Continual Learning Skipped: Model not found at {MODEL_PATH}")
        return False
        
    try:
        model = load_model(MODEL_PATH)
        # Use an extremely low learning rate for fine-tuning
        # to prevent catastrophic forgetting
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5),
            loss="binary_crossentropy",
            metrics=["accuracy"]
        )
        
        pdf_types = ["identity", "salary", "itr", "land_record"]
        inputs = []
        for pt in pdf_types:
            img = images_dict.get(pt)
            if img is None:
                img = np.zeros((1, 128, 128, 3), dtype=np.float32)
            elif len(img.shape) == 3:
                img = img[np.newaxis, ...]
            inputs.append(img)
            
        inputs.append(scaled_meta)
        
        y_true = np.array([predicted_label], dtype=np.float32)
        
        print(f"Continual Learning: Fine-tuning model on new instance. Ground truth label: {predicted_label}")
        model.fit(x=inputs, y=y_true, epochs=1, batch_size=1, verbose=0)
        
        model.save(MODEL_PATH)
        print("Continual Learning: Successfully updated and saved MMFFN weights.")
        return True
        
    except Exception as e:
        print(f"Continual Learning Error: {e}")
        return False
