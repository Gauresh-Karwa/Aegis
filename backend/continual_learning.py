"""
AEGIS Continual Learning  v2.0
================================
Micro-batch fine-tuning of the Logic FNN only.
The Visual CNN is NOT fine-tuned online (too slow / unstable on CPU).
"""

import os
import pickle
import numpy as np

LOGIC_MODEL_PATH  = os.path.join(
    os.path.dirname(__file__), "Aegis dataset", "aegis_output", "aegis_model_v1.keras"
)
SCALER_PATH = os.path.join(
    os.path.dirname(__file__), "Aegis dataset", "aegis_output", "meta_scaler.pkl"
)


def fine_tune_model(scaled_meta: np.ndarray, corrected_label: int) -> bool:
    """
    Perform a single-sample micro-gradient-update on the Logic FNN.

    Parameters
    ----------
    scaled_meta     : np.ndarray shape (1, 12) — already scaler-transformed
    corrected_label : 0 (safe) or 1 (fraudulent)

    Returns
    -------
    True on success, False if model not found or error occurs.
    """
    if not os.path.exists(LOGIC_MODEL_PATH):
        print(f"[CL] Skipped — Logic model not found at {LOGIC_MODEL_PATH}")
        return False

    try:
        import tensorflow as tf
        model = tf.keras.models.load_model(LOGIC_MODEL_PATH)

        # Recompile with very low LR to prevent catastrophic forgetting
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5),
            loss="binary_crossentropy",
            metrics=["accuracy"],
        )

        y_true = np.array([float(corrected_label)], dtype=np.float32)
        model.fit(
            scaled_meta, y_true,
            epochs=1, batch_size=1, verbose=0,
        )
        model.save(LOGIC_MODEL_PATH)
        print(f"[CL] Logic FNN fine-tuned (label={corrected_label}) and saved.")
        return True

    except Exception as e:
        print(f"[CL] Error during fine-tuning: {e}")
        return False
