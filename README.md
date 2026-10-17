# pi-wr-comfy-image

[![npm](https://img.shields.io/npm/v/pi-wr-comfy-image?logo=npm)](https://www.npmjs.com/package/pi-wr-comfy-image)
[![pi package](https://img.shields.io/badge/pi-package-orange)](https://pi.dev/packages/pi-wr-comfy-image)
[![release](https://img.shields.io/github/actions/workflow/status/web-revizor/pi-wr-comfy-image/release.yml?branch=main&label=release)](https://github.com/web-revizor/pi-wr-comfy-image/actions/workflows/release.yml)
[![license](https://img.shields.io/npm/l/pi-wr-comfy-image)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![built on Pi](https://img.shields.io/badge/built%20on-Pi-orange)](https://pi.dev)

Generate images in [pi](https://github.com/earendil-works/pi) with your own ComfyUI workflows. Every **App Mode** workflow
you save in ComfyUI that produces images can be run by the agent with one plain tool call — prompt, input images and any
input App Mode exposes, no annotations needed. Simple enough for small models.

- Works with any workflow: the plugin converts ComfyUI's UI format itself (subgraphs, Set/Get nodes, reroutes, bypassed
  and muted nodes), checked node by node against ComfyUI's own frontend.
- Inputs come from App Mode: what you exposed in the UI is what the agent can set, named after your node titles.
- Images are saved into the current project under `.pi/images/`; the agent gets their paths (no image tokens) and reads a file only when it needs to look.

## Quick start

Requirements: pi ≥ 1.0.1, Node 24, a running ComfyUI (≥ 0.38).

```bash
pi install npm:pi-wr-comfy-image
```

The latest release is installed; `pi update npm:pi-wr-comfy-image` brings it up to date. To pin a release, add its version:
`npm:pi-wr-comfy-image@<version>` or, from git, `git:github.com/web-revizor/pi-wr-comfy-image@v<version>`.

In ComfyUI, open a workflow, switch to App Mode, pick the inputs to expose and save it. Then ask the agent, e.g.
"generate a lighthouse at sunset with comfyui qwen21_i2i_t2i in t2i mode, 16:9". It uses two tools:

| Tool                    | What it does                                                           |
| ----------------------- | ---------------------------------------------------------------------- |
| `comfy_workflow_inputs` | lists the workflows and their params, one short line each              |
| `comfy_generate`        | runs a workflow: `workflow`, `prompt`, `images` (file paths), `params` |

```json
{
  "workflow": "qwen21_i2i_t2i",
  "prompt": "a lighthouse on a cliff at sunset, oil painting",
  "params": {
    "mode": "t2i",
    "aspect": "16:9",
    "output_long_side": 1024
  }
}
```

Param names come from your node titles — see [Parameters](docs/parameters.md).

## Ready-made workflows

No App Mode workflows yet? Run `/comfy-install-workflows` in pi: it copies four minimal workflows (core nodes only)
into ComfyUI's `workflows/pi-wr-comfy-image/` and never overwrites a file that is already there.

| Workflow                             | What it does                   |
| ------------------------------------ | ------------------------------ |
| `pi-wr-comfy-image/flux2_klein_t2i`  | FLUX.2 klein 4B, text to image |
| `pi-wr-comfy-image/flux2_klein_edit` | FLUX.2 klein 4B, edit an image |
| `pi-wr-comfy-image/qwen21_t2i`       | Qwen-Image 2.1, text to image  |
| `pi-wr-comfy-image/qwen21_edit`      | Qwen-Image 2.1, edit an image  |

The command lists the model files ComfyUI does not have yet, with download links — see [Workflows](docs/workflows.md).

"a lighthouse on a cliff at sunset, oil painting":

![FLUX.2 klein 4B and Qwen-Image 2.1, text to image](https://raw.githubusercontent.com/web-revizor/pi-wr-comfy-image/main/docs/images/t2i.jpg)

"make it a snowy winter night":

![Input image, FLUX.2 klein 4B edit and Qwen-Image 2.1 edit](https://raw.githubusercontent.com/web-revizor/pi-wr-comfy-image/main/docs/images/edit.jpg)

RTX 3060 12 GB, 1024×1024, default steps (FLUX.2 klein 4, Qwen-Image 25), time of a run with the models already loaded,
peak memory of the whole card. Qwen-Image ran with the `qwen3vl_8b_w4a8` text encoder.

## Documentation

| Document                                   | Contents                                              |
| ------------------------------------------ | ----------------------------------------------------- |
| [Configuration](docs/configuration.md)     | server URL, excluded workflows, timeout, prompt input |
| [Parameters](docs/parameters.md)           | the tool's arguments, param names, values, seeds      |
| [Workflows](docs/workflows.md)             | the bundled workflows, their params and model files   |
| [Troubleshooting](docs/troubleshooting.md) | common errors                                         |

## License

[Apache License 2.0](LICENSE); keep the [NOTICE](NOTICE) file when redistributing. ComfyUI and pi are separate projects
of their respective owners.
