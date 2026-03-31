"""
LumiTrace Depth Estimation
Integrates MiDaS and DPT for monocular depth estimation
"""
import torch
import torch.nn.functional as F
import numpy as np
import cv2
from typing import Tuple, Optional
from transformers import DPTImageProcessor, DPTForDepthEstimation
from PIL import Image

class DepthEstimator:
    """
    Monocular depth estimation using DPT (Dense Prediction Transformer)
    Optimized for RTX 5070 inference
    """
    
    MODELS = {
        "dpt_large": "Intel/dpt-large",
        "dpt_hybrid": "Intel/dpt-hybrid-midas",
        "dpt_swin2": "Intel/dpt-swinv2-large-384",
        "midas_v3": "Intel/dpt-large-ade"
    }
    
    def __init__(self, model_name: str = "dpt_large", device: str = "cuda"):
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")
        self.model_name = model_name
        self.model = None
        self.processor = None
        self._load_model()
        
    def _load_model(self):
        """Load DPT model optimized for RTX 5070"""
        model_id = self.MODELS.get(self.model_name, self.MODELS["dpt_large"])
        
        print(f"🔄 Loading depth model: {model_id}")
        
        try:
            self.processor = DPTImageProcessor.from_pretrained(model_id)
            self.model = DPTForDepthEstimation.from_pretrained(model_id)
            self.model.to(self.device)
            self.model.eval()
            
            if self.device.type == "cuda":
                self.model = torch.compile(self.model, mode="reduce-overhead")
                
            print(f"✅ Depth model loaded on {self.device}")
            
        except Exception as e:
            print(f"⚠️ Failed to load model: {e}")
            print("⚠️ Falling back to OpenCV depth estimation")
            self.model = None
    
    def estimate(self, image: np.ndarray, 
                 target_size: Optional[Tuple[int, int]] = None) -> np.ndarray:
        """
        Estimate depth from single image
        """
        if self.model is None:
            return self._fallback_depth(image)
        
        if image.shape[2] == 3 and image.dtype == np.uint8:
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        else:
            image_rgb = image
        
        pil_image = Image.fromarray(image_rgb)
        inputs = self.processor(images=pil_image, return_tensors="pt")
        
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        
        with torch.no_grad():
            outputs = self.model(**inputs)
            prediction = outputs.predicted_depth
        
        prediction = F.interpolate(
            prediction.unsqueeze(1),
            size=pil_image.size[::-1],
            mode="bicubic",
            align_corners=False,
        )
        
        depth = prediction.squeeze().cpu().numpy()
        depth = (depth - depth.min()) / (depth.max() - depth.min() + 1e-8)
        
        if target_size is not None:
            depth = cv2.resize(depth, (target_size[1], target_size[0]), 
                             interpolation=cv2.INTER_LINEAR)
        
        return depth.astype(np.float32)
    
    def estimate_video(self, video_path: str, 
                       output_path: Optional[str] = None,
                       fps: Optional[int] = None) -> str:
        """
        Process entire video for depth
        """
        cap = cv2.VideoCapture(video_path)
        
        if not cap.isOpened():
            raise ValueError(f"Cannot open video: {video_path}")
        
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        input_fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        if fps is None:
            fps = input_fps
        
        if output_path is None:
            output_path = video_path.rsplit(".", 1)[0] + "_depth.mp4"
        
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height), isColor=False)
        
        print(f"🎬 Processing video: {total_frames} frames @ {input_fps}fps")
        
        frame_count = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            depth = self.estimate(frame, target_size=(height, width))
            
            depth_uint8 = (depth * 255).astype(np.uint8)
            out.write(depth_uint8)
            
            frame_count += 1
            if frame_count % 30 == 0:
                progress = (frame_count / total_frames) * 100
                print(f"⏳ Progress: {progress:.1f}% ({frame_count}/{total_frames})")
        
        cap.release()
        out.release()
        
        print(f"✅ Depth video saved: {output_path}")
        return output_path
    
    def _fallback_depth(self, image: np.ndarray) -> np.ndarray:
        """Fallback depth estimation using classical methods"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        sobelx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        
        magnitude = np.sqrt(sobelx**2 + sobely**2)
        
        depth = 1.0 - (magnitude / (magnitude.max() + 1e-8))
        
        depth = cv2.GaussianBlur(depth, (15, 15), 0)
        
        return depth

class DepthPreprocessor:
    """
    Preprocess depth maps for path tracing
    """
    
    def __init__(self):
        self.depth_scale = 10.0
        
    def preprocess(self, depth: np.ndarray, 
                   image: Optional[np.ndarray] = None) -> np.ndarray:
        """
        Preprocess raw depth for path tracing
        """
        depth = self._remove_outliers(depth)
        depth = self._fill_holes(depth)
        
        if image is not None:
            depth = self._edge_aware_filter(depth, image)
        
        depth = depth * self.depth_scale
        
        return depth
    
    def _remove_outliers(self, depth: np.ndarray, threshold: float = 0.1) -> np.ndarray:
        """Remove depth outliers using median filter"""
        median = cv2.medianBlur((depth * 255).astype(np.uint8), 5).astype(np.float32) / 255
        diff = np.abs(depth - median)
        mask = diff < threshold
        return np.where(mask, depth, median)
    
    def _fill_holes(self, depth: np.ndarray) -> np.ndarray:
        """Fill missing depth values"""
        mask = (depth == 0).astype(np.uint8) * 255
        filled = cv2.inpaint((depth * 255).astype(np.uint8), mask, 3, cv2.INPAINT_TELEA)
        return filled.astype(np.float32) / 255
    
    def _edge_aware_filter(self, depth: np.ndarray, image: np.ndarray) -> np.ndarray:
        """Apply joint bilateral filter"""
        if len(image.shape) == 3:
            guide = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            guide = image
        
        depth_uint8 = (depth * 255).astype(np.uint8)
        filtered = cv2.ximgproc.jointBilateralFilter(
            guide, depth_uint8, 9, 75, 75
        )
        
        return filtered.astype(np.float32) / 255