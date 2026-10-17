# Parameters

`comfy_generate` takes four arguments:

| Argument   | Goes to                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `workflow` | the workflow name (path under ComfyUI's `workflows/` without `.app.json`)                             |
| `prompt`   | the prompt input — the first multi-line text input App Mode exposes, or `promptInput` from the config |
| `images`   | input image files (paths, relative to the project) for the `LoadImage` inputs, in App Mode order      |
| `params`   | any other input App Mode exposes, by name                                                             |

## Param names

Each exposed input gets a short name:

- the widget name when it is specific and unique in the workflow: `steps`, `aspect_ratio`, `megapixels`, `unet_name`;
- otherwise the node title, cut at its first `:`, `(`, `,`, `—` or `;`, in lowercase snake_case: "Seed" → `seed`, "📐 Output long side (px)" → `output_long_side`;
- when two titles give the same name, more of the title is used, then the node id (`same_7`, `same_8`).

The names are as good as your node titles: short, distinct titles make short, distinct params. English titles work
best: small models type ASCII names more reliably. The full key
`<nodeId>.<widget>` (`28.value`, `104:99.scale_by` inside a subgraph) is always accepted as well.

## Values

- Choices match the full value, its short form or a unique prefix: `"16:9"` finds "16:9 (Widescreen)".
- Numbers and booleans may be quoted (`"1024"`, `"false"`).
- Unknown names, wrong types, numbers outside min/max and values outside the choices are refused with the allowed
  names or choices, before anything is queued.
- Inputs you do not set keep the value saved in the workflow.

## Seeds

An input saved with the `randomize` control gets a new value on every run, as in ComfyUI, unless you set it. The seed
used is in the reply, so a result can be reproduced by passing it back.

## Reply

Text only — the images themselves are not attached, so they cost no tokens; the agent reads a file when it needs to look:

```
Saved 1 image(s):
- F:\my-project\.pi\images\pi-wr-comfy-image_qwen21_t2i-20261017-114204.png
seed: 42
33 s
Read a file to look at it.
```

## What the agent knows without asking

The `comfy_generate` description carries one line per workflow, so a plain request needs a single call:

```
pi-wr-comfy-image/qwen21_t2i: prompt; params: seed, steps, aspect_ratio, megapixels, unet_name, clip_name
pi-wr-comfy-image/qwen21_edit: prompt, 1 image; params: seed, steps, resolution, unet_name, clip_name
```

The description is built when pi starts; a workflow saved in ComfyUI later shows up in `comfy_workflow_inputs` right
away and in the description after a pi restart.

## Discovering params

`comfy_workflow_inputs` (optional `workflow`, `verbose`):

```
pi-wr-comfy-image/qwen21_t2i
  prompt: text
  seed: int 0.. (random each run)
  steps: int 1..10000 (= 25)
  aspect_ratio: "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9" (= "1:1")
  megapixels: float 0.1..16 (= 1)
  unet_name: file, 2 available (= "qwen_image_2.1_int8_convrot.safetensors")
  clip_name: file, 3 available (= "qwen3vl_8b_int8_convrot.safetensors")
```

`verbose: true` adds the node titles, the full keys and every choice.
