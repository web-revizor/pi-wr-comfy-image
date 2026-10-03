# Troubleshooting

**`ComfyUI at http://127.0.0.1:8188 is not responding - start it`.** Start ComfyUI; the plugin does not. The models stay
listed from the cache meanwhile.

**No `comfyui` models.** Only App Mode workflows with an image output count: open the workflow, switch to App Mode, pick
inputs and an output, save it. Check `exclude` in the config. Image models do not appear in `/model` — they are used
from codemode; `comfy_workflow_inputs` lists them.

**`unknown input "x"; allowed: …`** — the key is not exposed in App Mode, or its alias is ambiguous; use the full
`<nodeId>.<widget>` key from `comfy_workflow_inputs`.

**`"<node>" (#id): Value not in list …`** — ComfyUI rejected the prompt (`node_errors`): usually a model file that is not
installed or a value outside a list. The node title tells which.

**`node type "X" is not installed in ComfyUI`** — the workflow uses a custom node missing on this server.

**`no result after 600 s`** — the job keeps running in ComfyUI; raise `timeoutMs`, and in the codemode script raise
`// @options: {"timeout_ms": …}` as well, since the script has its own limit.

**The generation was cancelled.** When pi aborts, the plugin cancels only its own job (`/api/jobs/<id>/cancel`).
