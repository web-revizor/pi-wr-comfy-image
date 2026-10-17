# Bundled workflows

`/comfy-install-workflows` (a pi command) copies these App Mode workflows into ComfyUI's
`workflows/pi-wr-comfy-image/`. A file that is already there is left as it is, so your edits in ComfyUI stay; to get
the original back, delete or rename your copy and run the command again. The command needs ComfyUI to be running.

All four use core ComfyUI nodes only (ComfyUI ≥ 0.38). Images are saved by ComfyUI under `output/pi/`.

## Params

| Workflow           | Takes           | Params                                                                       |
| ------------------ | --------------- | ---------------------------------------------------------------------------- |
| `flux2_klein_t2i`  | prompt          | `seed`, `steps` (4), `aspect_ratio`, `megapixels`, `unet_name`, `clip_name`  |
| `flux2_klein_edit` | prompt, 1 image | `seed`, `steps` (4), `megapixels`, `unet_name`, `clip_name`                  |
| `qwen21_t2i`       | prompt          | `seed`, `steps` (25), `aspect_ratio`, `megapixels`, `unet_name`, `clip_name` |
| `qwen21_edit`      | prompt, 1 image | `seed`, `steps` (25), `resolution`, `unet_name`, `clip_name`                 |

For the edit workflows the prompt is an instruction ("make it a snowy winter night"). The output keeps the aspect of
the input image; its size is set by `megapixels` (FLUX.2, default 1 MP, sides in multiples of 16) or `resolution`
(Qwen-Image, about `resolution` × `resolution` pixels in multiples of 32, default 1024; `0` keeps the input size).

`unet_name` and `clip_name` accept any file in `models/diffusion_models/` and `models/text_encoders/`; pick one of the
same family (e.g. another quantization), since the text encoder type of each workflow is fixed.

## Model files

The command lists the files ComfyUI does not have; ComfyUI also offers to download them when the workflow is opened.

| Family          | File                                                                                                                                                             | Folder                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FLUX.2 klein 4B | [flux-2-klein-4b.safetensors](https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/diffusion_models/flux-2-klein-4b.safetensors)                | `models/diffusion_models/` |
| FLUX.2 klein 4B | [qwen_3_4b.safetensors](https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors)                               | `models/text_encoders/`    |
| FLUX.2 klein 4B | [flux2-vae.safetensors](https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors)                                           | `models/vae/`              |
| Qwen-Image 2.1  | [qwen_image_2.1_int8_convrot.safetensors](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main/diffusion_models/qwen_image_2.1_int8_convrot.safetensors) | `models/diffusion_models/` |
| Qwen-Image 2.1  | [qwen3vl_8b_int8_convrot.safetensors](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main/text_encoders/qwen3vl_8b_int8_convrot.safetensors)            | `models/text_encoders/`    |
| Qwen-Image 2.1  | [qwen_image_2.1_vae_bf16.safetensors](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main/vae/qwen_image_2.1_vae_bf16.safetensors)                      | `models/vae/`              |
