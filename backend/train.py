"""
Training script for Neural Path Tracer
Optimized for RTX 5070
"""
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
import argparse
from pathlib import Path
import json
from tqdm import tqdm

from backend.core.path_tracer import NeuralPathTracer, PathTracerCore, RenderConfig
from backend.core.depth_estimator import DepthEstimator

class PathTracingDataset(torch.utils.data.Dataset):
    """
    Dataset for training neural path tracer
    Generates training pairs: (depth, albedo) -> path_traced_result
    """
    
    def __init__(self, image_dir: str, num_samples: int = 1000):
        self.image_dir = Path(image_dir)
        self.image_files = list(self.image_dir.glob("*.jpg")) + list(self.image_dir.glob("*.png"))
        self.num_samples = num_samples
        
        self.depth_estimator = DepthEstimator()
        self.path_tracer = PathTracerCore()
        
    def __len__(self):
        return min(len(self.image_files), self.num_samples)
    
    def __getitem__(self, idx):
        import cv2
        import numpy as np
        
        # Load image
        img_path = self.image_files[idx % len(self.image_files)]
        image = cv2.imread(str(img_path))
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Resize for faster processing
        image = cv2.resize(image, (512, 512))
        
        # Estimate depth
        depth = self.depth_estimator.estimate(image)
        
        # Generate path traced ground truth
        config = RenderConfig(
            samples_per_pixel=256,
            max_bounces=8,
            resolution=(512, 512)
        )
        
        self.path_tracer.load_scene(depth, image)
        target = self.path_tracer.trace_paths(config)
        
        # Convert to tensors
        depth_tensor = torch.from_numpy(depth).unsqueeze(0).float()
        albedo_tensor = torch.from_numpy(image).permute(2, 0, 0).float() / 255.0
        target_tensor = torch.from_numpy(target).permute(2, 0, 1).float() / 255.0
        
        return {
            'depth': depth_tensor,
            'albedo': albedo_tensor,
            'target': target_tensor
        }

def train(args):
    """Main training loop"""
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"🚀 Training on {device}")
    
    if torch.cuda.is_available():
        print(f"   GPU: {torch.cuda.get_device_name(0)}")
        print(f"   VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
    
    # Model
    model = NeuralPathTracer().to(device)
    
    # Multi-GPU if available
    if torch.cuda.device_count() > 1:
        print(f"   Using {torch.cuda.device_count()} GPUs")
        model = nn.DataParallel(model)
    
    # Optimizer
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    
    # Loss
    criterion = nn.L1Loss()
    
    # Dataset
    print(f"📁 Loading dataset from {args.dataset}")
    dataset = PathTracingDataset(args.dataset, num_samples=args.num_samples)
    dataloader = DataLoader(
        dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=4,
        pin_memory=True
    )
    
    # Training loop
    best_loss = float('inf')
    history = {'train_loss': []}
    
    for epoch in range(args.epochs):
        model.train()
        epoch_loss = 0.0
        
        pbar = tqdm(dataloader, desc=f"Epoch {epoch+1}/{args.epochs}")
        for batch in pbar:
            depth = batch['depth'].to(device)
            albedo = batch['albedo'].to(device)
            target = batch['target'].to(device)
            
            # Forward
            output = model(depth, albedo)
            loss = criterion(output, target)
            
            # Backward
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
            epoch_loss += loss.item()
            pbar.set_postfix({'loss': f'{loss.item():.4f}'})
        
        avg_loss = epoch_loss / len(dataloader)
        history['train_loss'].append(avg_loss)
        
        scheduler.step()
        
        print(f"✅ Epoch {epoch+1} - Loss: {avg_loss:.4f}")
        
        # Save checkpoint
        if avg_loss < best_loss:
            best_loss = avg_loss
            checkpoint = {
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'loss': best_loss,
            }
            
            output_path = Path(args.output)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            torch.save(checkpoint, args.output)
            print(f"💾 Saved best model to {args.output}")
        
        # Save history
        with open(f"{args.output}.json", "w") as f:
            json.dump(history, f)
    
    print("🎉 Training complete!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Neural Path Tracer")
    parser.add_argument("--dataset", type=str, required=True, help="Path to training images")
    parser.add_argument("--epochs", type=int, default=100, help="Number of epochs")
    parser.add_argument("--batch-size", type=int, default=8, help="Batch size")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate")
    parser.add_argument("--num-samples", type=int, default=1000, help="Number of training samples")
    parser.add_argument("--output", type=str, default="models/neural_tracer.pt", help="Output path")
    
    args = parser.parse_args()
    train(args)