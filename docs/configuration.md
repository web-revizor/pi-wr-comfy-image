# Configuration

`~/.pi/agent/wr-comfy-image.json` — optional; every field has a default. A broken file is reported at pi startup, and
then the tools and the `/comfy-install-workflows` command are not registered.

```json
{
  "url": "http://127.0.0.1:8188",
  "exclude": ["old/**", "*_draft*"],
  "timeoutMs": 600000,
  "promptInput": { "my_workflow": "12.text" }
}
```

| Key           | Default                 | Meaning                                                                                                                                                 |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`         | `http://127.0.0.1:8188` | ComfyUI server; a remote one works the same                                                                                                             |
| `exclude`     | `[]`                    | globs on the file path under `workflows/`, including `.app.json`, case-insensitive: `*` within a folder, `**` across folders (`drafts/*`, `x.app.json`) |
| `timeoutMs`   | `600000`                | how long one generation may take; after that the plugin stops waiting                                                                                   |
| `promptInput` | `{}`                    | workflow name → the `<nodeId>.<widget>` key of an exposed input the prompt goes to (keys: `comfy_workflow_inputs` with `verbose: true`)                 |

`promptInput` is for a workflow whose first multi-line text input is not the prompt. The key must be one App Mode
exposes; otherwise the workflow has no prompt input.

## Which workflows are offered

Every `*.app.json` under ComfyUI's `user/default/workflows/` (read over its API) that is saved in App Mode with an image
output picked as its output (`SaveImage`, `PreviewImage`, `SaveImageAdvanced`, any output node taking images), minus
`exclude`. Video and audio workflows are skipped. The workflow name is the path without `.app.json`.

Generated images are saved in the session's project under `.pi/images/`.

The list is cached in `~/.pi/agent/cache/wr-comfy-image.json`, so the workflows are listed when ComfyUI is down. It is
read again when pi starts with ComfyUI up, by `comfy_workflow_inputs`, after `/comfy-install-workflows`, and by the
first `comfy_generate` when pi started with ComfyUI down. `comfy_generate` runs only listed workflows: a workflow saved
later needs one of these first (`comfy_workflow_inputs` is the quickest). A listed workflow is read fresh on every
generation, so edits in ComfyUI apply immediately.

The plugin never starts or stops ComfyUI.
