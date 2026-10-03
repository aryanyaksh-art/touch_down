# TouchDown

A from-scratch recreation of the autonomous sample-collection system NASA's OSIRIS-REx used at asteroid Bennu: a spacecraft that finds its position without GPS, checks for hazards, and decides alone whether to touch down or back away.

## Faithful vs. extension
| Component | Real OSIRIS-REx | TouchDown |
|---|---|---|
| Navigation | Natural Feature Tracking (NFT) | Same method, reimplemented |
| Hazard avoidance | Ground-built hazard map, back-away at ~5 m | Same (baseline) |
| Onboard hazard detection | None | Extension: neural network on descent images |

## Status
Planning complete. See [docs/PLAN.md](docs/PLAN.md). Implementation starts with Week 1 (repo scaffold, Bennu terrain, Blender rendering).
