# Troubleshooting

**`ComfyUI at http://127.0.0.1:8188 is not responding - start it`.** Start ComfyUI; the plugin does not. The workflows stay
listed from the cache meanwhile.

**A workflow is missing.** Only App Mode workflows with an image output count: open the workflow, switch to App Mode,
pick inputs and an output, save it. Check `exclude` in the config. New workflows are picked up by
`comfy_workflow_inputs` or at the next pi start.

**`No ComfyUI workflow "x". Available: …`** — a wrong name, or a workflow saved after the list was read: run
`comfy_workflow_inputs` once.

**`unknown input "x"; allowed: …`** — the name is not exposed in App Mode; use a name from `comfy_workflow_inputs`,
or the full `<nodeId>.<widget>` key from its `verbose` listing.

**`<name>: must be one of …`, `<name>: must be ≤ …`, `<name>: must be a number`** — the value is outside the input's
choices or range; the message gives the allowed values or the bound.

**`this workflow exposes no prompt input`** — the workflow has no multi-line text input in App Mode, or `promptInput`
in the config names a key App Mode does not expose.

**`this workflow takes N image(s), got more`** — pass at most as many images as the workflow has image inputs.

**`<file>: not a png, jpg, webp or gif image`** — input images must be one of these formats.

**`"<node>" (#id): Value not in list …`** — ComfyUI rejected the prompt (`node_errors`): usually a model file that is not
installed or a value outside a list. The node title tells which. `/comfy-install-workflows` lists the missing model
files of the bundled workflows with download links.

**`"<node>": node type "X" is not installed in ComfyUI`** — the workflow uses a node this server does not have: a
missing custom node, or a ComfyUI older than the workflow needs (the bundled ones need ≥ 0.38).

**`no result after 600 s - ComfyUI keeps prompt <id>`** — the job keeps running in ComfyUI; raise `timeoutMs` in the
config.

**`cancelled (prompt <id>)`** — pi aborted the call; the plugin cancels only its own job (`/api/jobs/<id>/cancel`).
