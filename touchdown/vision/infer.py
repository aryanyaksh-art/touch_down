"""Run the trained hazard network on a navigation frame (used by the descent simulator)."""
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from touchdown.vision.unet import UNet


class HazardNet:
    def __init__(self, checkpoint: str | Path, device: str | None = None):
        self.device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
        ck = torch.load(checkpoint, map_location=self.device)
        self.model = UNet(base=ck.get("base", 24)).to(self.device)
        self.model.load_state_dict(ck["model"])
        self.model.eval()

    @torch.no_grad()
    def predict(self, img_u8: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """img_u8: (H,W) uint8 -> (classes (H,W) uint8, probabilities (3,H,W) float32). Pads to a multiple of 16."""
        h, w = img_u8.shape
        x = torch.from_numpy(img_u8.astype(np.float32) / 255.0)[None, None].to(self.device)
        ph, pw = (-h) % 16, (-w) % 16
        x = F.pad(x, (0, pw, 0, ph), mode="reflect")
        p = self.model(x).softmax(1)[0, :, :h, :w].cpu().numpy()
        return p.argmax(0).astype(np.uint8), p.astype(np.float32)
