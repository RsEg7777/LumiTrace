"""
Image processing utilities for LumiTrace
"""
import cv2
import numpy as np
from typing import Tuple, Optional
from PIL import Image
import io

class ImageProcessor:
    """Handle image preprocessing and postprocessing"""
    
    def __init__(self):
        self.supported_formats = [".jpg", ".jpeg", ".png", ".bmp", ".tiff"]
    
    def load(self, file_bytes: bytes) -> np.ndarray:
        """Load image from bytes"""
        nparr = np.frombuffer(file_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Failed to decode image")
        return image
    
    def save(self, image: np.ndarray, format: str = "png") -> bytes:
        """Save image to bytes"""
        _, buffer = cv2.imencode(f".{format}", image)
        return buffer.tobytes()
    
    def resize(self, image: np.ndarray, 
               max_size: int = 1920,
               maintain_aspect: bool = True) -> np.ndarray:
        """Resize image if too large"""
        h, w = image.shape[:2]
        
        if max(h, w) <= max_size:
            return image
        
        if maintain_aspect:
            if h > w:
                new_h = max_size
                new_w = int(w * (max_size / h))
            else:
                new_w = max_size
                new_h = int(h * (max_size / w))
        else:
            new_w = new_h = max_size
        
        return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    
    def enhance(self, image: np.ndarray) -> np.ndarray:
        """Enhance image quality before processing"""
        denoised = cv2.fastNlMeansDenoisingColored(image, None, 10, 10, 7, 21)
        
        kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
        sharpened = cv2.filter2D(denoised, -1, kernel)
        
        return sharpened
    
    def create_side_by_side(self, original: np.ndarray, 
                           processed: np.ndarray) -> np.ndarray:
        """Create side-by-side comparison"""
        h, w = original.shape[:2]
        processed = cv2.resize(processed, (w, h))
        
        font = cv2.FONT_HERSHEY_SIMPLEX
        orig_label = original.copy()
        proc_label = processed.copy()
        
        cv2.putText(orig_label, "Original", (10, 30), font, 1, (0, 255, 0), 2)
        cv2.putText(proc_label, "Path Traced", (10, 30), font, 1, (0, 255, 0), 2)
        
        return np.hstack([orig_label, proc_label])