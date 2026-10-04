# Configuration

`~/.pi/agent/wr-comfy-image.json` — optional; every field has a default. A broken file is reported at pi startup and
the provider is not registered.

```json
{
  "url": "http://127.0.0.1:8188",
  "exclude": ["old/*", "*_laptop*"],
  "timeoutMs": 600000,
  "promptInput": { "qwen21_i2i_t2i": "44.string" }
}
```

| Key           | Default                 | Meaning                                                                                                    |
| ------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `url`         | `http://127.0.0.1:8188` | ComfyUI server; a remote one works the same                                                                |
| `exclude`     | `[]`                    | globs on the path under `workflows/`: `*` within a folder, `**` across folders                             |
| `timeoutMs`   | `600000`                | how long one generation may take; after that the plugin stops waiting                                      |
| `promptInput` | `{}`                    | per model id: the input the prompt text goes to, when the first multi-line text input is not the right one |

## Which workflows are offered

Every `*.app.json` under ComfyUI's `user/default/workflows/` (read over its API) that is saved in App Mode and has an
image output (`SaveImage`, `PreviewImage`, `SaveImageAdvanced`, any output node taking images), minus `exclude`. Video
and audio workflows are skipped. The workflow name is the path without `.app.json`.

Generated images are saved in the session's project under `.pi/images/`.

The list is cached in `~/.pi/agent/cache/wr-comfy-image.json`, so the workflows are listed when ComfyUI is down; they
are re-read when pi starts with ComfyUI up and by `comfy_workflow_inputs`. A workflow is read fresh on
every generation, so edits in ComfyUI apply immediately.

The plugin never starts or stops ComfyUI.
