# pi-wr-comfy-image — design

Date: 2026-10-03. Status: draft for review.

## Goal

A standalone pi package that turns a ComfyUI server into a native pi **image-model provider** (pi ≥ 1.0 image API,
`generateImages`). Every ComfyUI App Mode workflow that produces images becomes a pi image model; an agent calls it
from codemode with `models.generateImages()` and gets the images back, plus the file paths.

It is more universal than existing ComfyUI integrations for pi (`pi-comfyui-paint`): workflows need no hand
annotation — App Mode already declares the inputs and outputs — and any model family works, because the plugin works
on the graph, not on known models.

## Decisions (agreed)

| Topic               | Decision                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Package             | separate repository and package, `F:\pi-wr-comfy-image`                                         |
| Output              | images only (no video, audio)                                                                   |
| Workflow source     | App Mode workflows saved in ComfyUI (`user/default/workflows/**.app.json`), read over its API   |
| Selection           | every App Mode workflow with an image output, minus `exclude` patterns from the config          |
| Parameters          | prompt text + input images + an optional JSON block; discovery tool `comfy_workflow_inputs`     |
| ComfyUI not running | clear error; the plugin never starts or stops the server                                        |
| Servers             | one server, URL in the config                                                                   |
| UI → API conversion | own converter at runtime; ComfyUI's frontend (`graphToPrompt`) only as a reference in dev tests |

Out of scope for v1: video, several servers / load balancing, starting ComfyUI, WebSocket progress, workflows without
App Mode.

## Context and constraints

- pi image API: an extension registers a provider whose models have `type: "image"`, `api: "<id>"`, `output: ["image",
"text"]`, and supplies `images: { "<id>": { generateImages(model, context, options) } }`. `context.input` holds only
  text and image blocks; codemode passes no other options. Results are `AssistantImages` (`output` of image/text
  blocks, `stopReason`, `errorMessage`). pi does not save images to disk.
- `ProviderModelConfig` is a union of chat / image / classifier entries (pi 0.99+).
- App Mode files are in the UI format: `nodes`, `links`, positional `widgets_values`, `definitions.subgraphs`,
  `extra.linearData.inputs` (`[nodeId, widgetName, options?]`) and `extra.linearData.outputs` (`[nodeId]`).
- `POST /prompt` accepts only the API format; the UI → API conversion normally happens in the browser frontend.
- ComfyUI 0.38 has targeted cancellation (`POST /api/jobs/{id}/cancel`: dequeues a pending job, interrupts only that
  job if running) and accepts a client-supplied `prompt_id` (UUID). There is no validate-only mode: `/prompt` validates
  and then queues.
- Hardware for tests: RTX 3060 12 GB. Long or large generations are avoided in tests.

## Architecture

TypeScript strict, ESM, Node 24+. One esbuild bundle for pi (`@earendil-works/pi-coding-agent` external, imported for
types only). Installed with `pi install git:github.com/web-revizor/pi-wr-comfy-image@v<version>`.

| Module           | Responsibility                                                                                                                                             | Depends on                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `config.ts`      | read and validate `~/.pi/agent/wr-comfy-image.json` (zod): `url`, `exclude`, `timeoutMs`, per-workflow `promptInput`                                       | —                                  |
| `comfyClient.ts` | HTTP: `/object_info`, `/api/userdata?dir=workflows`, `/api/userdata/<file>`, `/upload/image`, `/prompt`, `/history/<id>`, `/view`, `/api/jobs/<id>/cancel` | `config`                           |
| `catalog.ts`     | discover App Mode workflows, keep image-output ones, apply `exclude`, build the model list and input schemas, cache to disk                                | `comfyClient`, `appInputs`         |
| `convert/`       | UI → API conversion (pure functions over the workflow JSON and `/object_info`)                                                                             | —                                  |
| `appInputs.ts`   | App Mode `linearData` → input schema (key, alias, label, type, default, choices, control)                                                                  | `convert` (node lookup)            |
| `params.ts`      | `ImagesContext.input` → prompt text, images, JSON parameters; validate against the schema                                                                  | `appInputs`                        |
| `runner.ts`      | upload images, apply values, submit, check `node_errors`, wait on `/history`, download outputs, cancel                                                     | `comfyClient`, `convert`, `params` |
| `extension.ts`   | register the `comfyui` provider (image models + `generateImages`) and the `comfy_workflow_inputs` tool                                                     | all of the above                   |

Data flow:

```
models.generateImages({ provider: "comfyui", id: "qwen21_i2i_t2i" }, { input })
  → params:  prompt text, images, {"118.value": 42, "cfg": 3.5}
  → catalog: UI workflow + input schema (cache, refreshed from ComfyUI)
  → convert: UI → API prompt;  apply values to the App Mode inputs
  → runner:  /upload/image → POST /prompt (node_errors?) → poll /history → /view
  ← output:  image blocks (base64) + a text block: saved paths, seed, duration
```

## Catalog

- Workflows: every `*.app.json` (recursively) whose `extra.linearMode`/`linearData` is present and whose
  `linearData.outputs` contain at least one image-producing node (`SaveImage`, `PreviewImage`, or any node whose
  `/object_info` output node returns images).
- `exclude`: glob-like patterns on the path relative to the workflows folder (`old/*`, `*_laptop*`).
- Model id: that relative path without `.app.json` (`qwen21_i2i_t2i`, `sub/flux_t2i`); name: the same.
- Cache: `~/.pi/agent/cache/wr-comfy-image.json` (model list + schemas + workflow revisions). pi starts with the cached
  list when ComfyUI is down; it is refreshed when ComfyUI answers.

## Parameters

Input schema per workflow, from `linearData.inputs`:

- **Key** `<nodeId>.<widget>` (`118.value`, `10.cfg`) — always accepted.
- **Alias** the widget name when it is unique among the workflow's inputs (`cfg`, `aspect`, `unet_name`).
- **Label** the node title (users write them as instructions, e.g. "🎲 SEED: fixed = …").
- **Type** from `/object_info`: int / float (min, max, step), boolean, string, combo (choices), image.
- **Default** the value saved in the workflow; **control** `randomize` / `fixed` / … for seeds.

Mapping of a `generateImages` call:

1. **Prompt text** — the plain text blocks (not JSON) go to the prompt input: `promptInput` from the config if set,
   otherwise the first text input in App Mode order (`StringConstantMultiline.string`, `CLIPTextEncode.text`, …).
2. **Images** — image blocks go to the `LoadImage`-type inputs in App Mode order, uploaded with `/upload/image`.
3. **JSON block** — a text block that parses as a JSON object: keys or aliases → values. Unknown keys, wrong types,
   values outside a combo's choices or outside min/max → error listing what is allowed; nothing is submitted.
4. **Seeds** — an input whose control is `randomize` gets a new random value per run unless given explicitly. The
   value used is returned.
5. Everything else keeps the value saved in the workflow.

`comfy_workflow_inputs` (pi tool): without arguments lists every model with its inputs; with `workflow` shows one,
including choices and defaults.

## Converter (UI → API)

1. **Flatten subgraphs** — each subgraph instance expands to its inner nodes with ids `<parent>:<child>`; links through
   the subgraph's input/output slots are joined end to end; nested subgraphs recursively.
2. **Virtual nodes** — node types missing from `/object_info` (Note, MarkdownNote, Reroute, frontend `PrimitiveNode`)
   are removed; links through Reroute are followed to the source; a `PrimitiveNode`'s value moves to the inputs it
   feeds.
3. **Modes** — muted nodes (mode 2) are removed, and nodes left without a required input are removed too; bypassed
   nodes (mode 4) are replaced by passing each output through from the first input of the same type.
4. **Widgets** — the node's widget inputs are taken in `/object_info` order (required, then optional) and consume
   `widgets_values` positionally, skipping the extra values the frontend stores (`control_after_generate` after a
   seed, `image_upload` in `LoadImage`). A widget converted to an input and fed by a link takes the link instead.
5. **Links** — each remaining input link becomes `[sourceNodeId, sourceSlot]`.
6. A mismatch between `widgets_values` and `/object_info` (missing node type, wrong count) is an error naming the node;
   nothing is guessed.

Output: `{ [nodeId]: { class_type, inputs } }` plus a map from App Mode keys to `(apiNodeId, inputName)`.

## Errors

| Situation                        | Result to the agent (`stopReason: "error"`, `errorMessage`)                     |
| -------------------------------- | ------------------------------------------------------------------------------- |
| ComfyUI unreachable              | "ComfyUI at <url> is not responding — start it"                                 |
| invalid parameters               | the offending key and the allowed keys / choices / range                        |
| conversion failed                | the node title and what does not match                                          |
| `node_errors` from `/prompt`     | node title → reason (e.g. "value not in list: <model>")                         |
| execution error                  | node and message from `/history`                                                |
| over `timeoutMs` (default 600 s) | the prompt id; ComfyUI keeps the job                                            |
| pi aborts the request            | `POST /api/jobs/<id>/cancel` (the id is chosen by the plugin before submitting) |

## Testing

1. **Unit** (committed fixtures, small synthetic workflows): widgets and extra values, seeds, subgraphs, bypass / mute,
   Reroute / PrimitiveNode, App Mode schema, parameter parsing and errors, catalog filtering and `exclude`.
2. **Frontend parity** (local only, opt-in): Playwright opens the local ComfyUI, converts each of the user's App Mode
   workflows with the frontend's `graphToPrompt()`, and compares it with ours. The user's workflows and the reference
   output are never committed.
3. **Real generation** (local only, opt-in): the shortest image workflow at minimum size and steps; free VRAM checked
   first; time and peak VRAM recorded; images under `test-results/`.
4. **End to end through pi**: `pi -p` with codemode calling `generateImages`, expecting an image block and a path.

There is no validate-only endpoint, so the conversion is checked by parity (2) and by real runs (3), not by a dry
submit.

## Documentation

README (what it is, install, quick start, index) and `docs/` pages: configuration, parameters, workflows and App Mode,
troubleshooting, development.
