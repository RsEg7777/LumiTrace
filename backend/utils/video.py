"""
Video processing utilities for LumiTrace
"""
import cv2
import numpy as np
import torch
from typing import Callable, Optional
from pathlib import Path
import asyncio

class VideoProcessor:
    """Handle video processing pipeline"""
    
    def __init__(self):
        self.temporal_denoiser = None
        
    async def process(self,
                     input_path: str,
                     output_path: str,
                     depth_estimator,
                     path_tracer,
                     denoiser,
                     samples: int,
                     max_bounces: int,
                     target_fps: Optional[int],
                     progress_callback: Optional[Callable] = None):
        """
        Process video with path tracing
        """
        cap = cv2.VideoCapture(input_path)
        
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        if target_fps is None:
            target_fps = fps
        
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(output_path, fourcc, target_fps, (width, height))
        
        if denoiser:
            from core.denoiser import TemporalDenoiser
            self.temporal_denoiser = TemporalDenoiser()
        
        frame_count = 0
        prev_depth = None
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            depth = depth_estimator.estimate(frame, target_size=(height, width))
            
            if prev_depth is not None:
                depth = 0.7 * depth + 0.3 * prev_depth
            prev_depth = depth.copy()
            
            from core.path_tracer import RenderConfig
            config = RenderConfig(
                samples_per_pixel=samples,
                max_bounces=max_bounces,
                resolution=(width, height),
                use_denoising=True,
                temporal_accumulation=True
            )
            
            path_tracer.load_scene(depth, frame)
            rendered = path_tracer.trace_paths(config)
            
            if denoiser and self.temporal_denoiser:
                rendered = self.temporal_denoiser.process(rendered)
            
            out.write(rendered)
            
            frame_count += 1
            if progress_callback:
                progress_callback(frame_count / total_frames)
            
            if frame_count % 10 == 0:
                await asyncio.sleep(0)
        
        cap.release()
        out.release()