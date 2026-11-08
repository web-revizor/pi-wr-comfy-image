# Changelog

## [0.4.0]

### Added

- App Mode fields inside dynamic combos now work as params. Switching the combo's option sends that option's fields.
- Workflows that need a model or node you do not have are marked in the workflow list.
- `comfy_generate` shows the elapsed time while it runs.
- App Mode inputs that cannot be used from pi are listed by `comfy_workflow_inputs`.
- Agents get short usage rules for the ComfyUI tools.
- A `comfy-image` skill helps agents pick a workflow, write prompts and react to errors. Run it with `/skill:comfy-image`.

- Simple mode for small models: one `generate_image` tool over two workflows you pick. Turn it on with `/comfy-simple`.

### Changed

- A workflow that fails twice in a row is refused for 2 minutes, and the agent is told to stop and report why.
- A workflow whose model file is not installed is refused before anything is queued.
- Errors end with what to do next, and a wrong workflow name suggests the full one.
- A fractional value for a whole-number param is rounded.
- Params that pick a model file are left out of the short listing. They still work; `verbose` shows them.
- The bundled FLUX.2 klein workflows are deprecated. Use the Qwen-Image workflows.
- The workflow list in the tool description updates when your workflows change, without `/reload`.
- Param names of dynamic combo fields use the field name, e.g. `photo` instead of `switch.photo`.

### Fixed

- Several images requested at once no longer time out while waiting in ComfyUI's queue.
- Two results saved in the same second no longer overwrite each other.
- Using the same input image again no longer adds another file to ComfyUI's `input/` folder.
