# Test results

## 2026-10-03 — first working version (0.1.0)

Setup: ComfyUI 0.38.0 (frontend 1.53.x), RTX 3060 12 GB (≈1.1 GB used idle), pi 1.0.0.

| Check                 | Result                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit tests            | 21 / 21                                                                                                                                                                        |
| Frontend parity       | 16 / 16 of the user's App Mode workflows identical to `graphToPrompt()` node by node (subgraphs, Set/Get, rgthree Power Lora Loader, CustomCombo, dynamic combos, bypass/mute) |
| Catalog               | 12 image workflows found, 4 video workflows skipped                                                                                                                            |
| Real run (script)     | `flux2_klein9b_i2i_t2i`, t2i, quality "Низький 4/4", long side 512, 1:1 → 1 image, 28.7 s, peak VRAM 11.86 GB (cold model load)                                                |
| End to end through pi | `pi -p` with codemode → `models.generateImages()` → image returned and described by the model, 22.4 s (warm)                                                                   |

Not covered yet: image input (i2i) through pi, cancel during a run, timeout, workflows inside a subfolder.
