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

- the widget name when it is specific and unique in the workflow: `cfg`, `aspect`, `unet_name`, `denoise`;
- otherwise the node title, cut at its first `:`, `(`, `,`, `—` or `;`, in lowercase snake_case and in whatever language
  the title is written: "🎲 SEED: fixed = …" → `seed`, "📐 Довга сторона результату (px)" → `довга_сторона_результату`;
- when two titles give the same name, more of the title is used, then the node id (`same_7`, `same_8`).

The names are as good as your node titles: short, distinct titles make short, distinct params. The full key
`<nodeId>.<widget>` (`118.value`, `104:99.scale_by` inside a subgraph) is always accepted as well.

## Values

- Choices match the full value, its short form or a unique prefix: `"t2i"` finds "t2i — з нуля за промптом".
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
- F:\my-project\.pi\images\qwen21_i2i_t2i-20261004-031340.png
seed: 311515242217939
16.2 s
Read a file to look at it.
```

## Discovering params

`comfy_workflow_inputs` (optional `workflow`, `verbose`):

```
qwen21_i2i_t2i
  prompt: text
  images: 1 (вхідне_фото)
  режим: "i2i" | "t2i" | "edit" (= "i2i")
  unet_name: file, 8 available (= "qwen_image_2.1_int8_convrot.safetensors")
  seed: int (random each run)
  aspect: "3:4" | "2:3" | "9:16" | "4:5" | "1:1" | "4:3" | "3:2" | "16:9" | "from image" (= "from image")
  довга_сторона_результату: int (= 2040)
```

`verbose: true` adds the node titles, the full keys and every choice.
