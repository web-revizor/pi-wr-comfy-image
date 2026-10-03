# Parameters

`models.generateImages(model, { input })` only carries text and image blocks, so the plugin reads them like this:

| Block                                    | Goes to                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| plain text                               | the prompt input — the first multi-line text input App Mode exposes, or `promptInput` from the config |
| image (`{type:"image", data, mimeType}`) | the image inputs (`LoadImage`) in App Mode order; uploaded to ComfyUI's `input/`                      |
| text that is a JSON object               | inputs by key or alias                                                                                |

## Keys

- **Key** `<nodeId>.<widget>`, e.g. `118.value`, `10.cfg`; inside a subgraph `104:99.scale_by`. Always accepted.
- **Alias** the widget name when no other exposed input shares it: `cfg`, `aspect`, `unet_name`.

```json
{ "105.choice": "t2i — з нуля за промптом", "seed": 42, "aspect": "16:9" }
```

Values are checked before anything is queued: unknown keys, wrong types, numbers outside min/max and values outside a
list of choices are refused with the allowed keys or choices. Inputs you do not set keep the value saved in the
workflow.

## Seeds

An input saved with the `randomize` control gets a new value on every run, as in ComfyUI, unless you set it. The seed
used is in the reply, so a result can be reproduced by passing it back.

## Reply

Image blocks with the generated images, then a text block:

```
saved: output/flux2-i2i_00004_.png · seed: 118.value=361387510757214 · 22.4 s, prompt 5f0ed2c8-…
```

## Discovering inputs

`comfy_workflow_inputs` (optional `workflow` argument):

```
flux2_klein9b_i2i_t2i
  105.choice — Режим: i2i / t2i — one of: "i2i — перемалювати вхідне фото", "t2i — з нуля за промптом"
  image#1 ← 1.image (image) — 1. ВХІДНЕ ФОТО (input/) — image
  prompt ← 44.string (string) — Ручний промпт (коли switch = false) — string = "…"
  118.value — 🎲 SEED: … — int = 663169675039627, randomize
  110.aspect (aspect) — 📐 РОЗМІР генерації … — one of: "3:4", "2:3", …, "from image"
```

Node titles are the labels, so writing instructions into titles ("0 = off", "only for i2i") helps the agent.
