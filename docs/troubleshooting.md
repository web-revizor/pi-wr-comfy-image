# Troubleshooting

**`ComfyUI at http://127.0.0.1:8188 is not responding - start it`.** Start ComfyUI; the plugin does not. The workflows stay
listed from the cache meanwhile.

**A workflow is missing.** Only App Mode workflows with an image output count: open the workflow, switch to App Mode,
pick inputs and an output, save it. Check `exclude` in the config. New workflows are picked up by
`comfy_workflow_inputs` or at the next pi start.

**`unknown input "x"; allowed: …`** — the name is not exposed in App Mode; use a name from `comfy_workflow_inputs`,
or the full `<nodeId>.<widget>` key from its `verbose` listing.

**`"<node>" (#id): Value not in list …`** — ComfyUI rejected the prompt (`node_errors`): usually a model file that is not
installed or a value outside a list. The node title tells which.

**`node type "X" is not installed in ComfyUI`** — the workflow uses a custom node missing on this server.

**`no result after 600 s`** — the job keeps running in ComfyUI; raise `timeoutMs` in the config.

**The generation was cancelled.** When pi aborts, the plugin cancels only its own job (`/api/jobs/<id>/cancel`).
