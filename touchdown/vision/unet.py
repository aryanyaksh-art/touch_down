"""A compact U-Net for 3-class hazard segmentation of grey navigation frames. Input (B,1,H,W) with H, W divisible by 16."""
import torch
import torch.nn as nn
import torch.nn.functional as F


def block(cin: int, cout: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
        nn.Conv2d(cout, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True))


class UNet(nn.Module):
    def __init__(self, in_ch: int = 1, n_classes: int = 3, base: int = 24):
        super().__init__()
        c = [base, base * 2, base * 4, base * 8, base * 16]
        self.enc = nn.ModuleList([block(in_ch, c[0])] + [block(c[i], c[i + 1]) for i in range(4)])
        self.up = nn.ModuleList([nn.ConvTranspose2d(c[i + 1], c[i], 2, stride=2) for i in range(4)])
        self.dec = nn.ModuleList([block(c[i] * 2, c[i]) for i in range(4)])
        self.head = nn.Conv2d(c[0], n_classes, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        skips = []
        for i, e in enumerate(self.enc):
            x = e(x)
            if i < 4:
                skips.append(x)
                x = F.max_pool2d(x, 2)
        for i in reversed(range(4)):
            x = self.up[i](x)
            x = self.dec[i](torch.cat([x, skips[i]], dim=1))
        return self.head(x)


def n_params(m: nn.Module) -> int:
    return sum(p.numel() for p in m.parameters())
