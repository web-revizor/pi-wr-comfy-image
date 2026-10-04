# pi-wr-comfy-image

Generate images in [pi](https://github.com/earendil-works/pi) with your own ComfyUI workflows. Every **App Mode** workflow
you save in ComfyUI that produces images can be run by the agent with one plain tool call — prompt, input images and any
input App Mode exposes, no annotations needed. Simple enough for small models.

- Works with any workflow: the plugin converts ComfyUI's UI format itself (subgraphs, Set/Get nodes, reroutes, bypassed
  and muted nodes), checked node by node against ComfyUI's own frontend.
- Inputs come from App Mode: what you exposed in the UI is what the agent can set, named after your node titles.
- Images are saved into the current project under `.pi/images/` and shown to the agent.

## Quick start

Requirements: pi ≥ 1.0.1, Node 24, a running ComfyUI (≥ 0.38).

```bash
pi install git:github.com/web-revizor/pi-wr-comfy-image@v0.2.0
```

In ComfyUI, open a workflow, switch to App Mode, pick the inputs to expose and save it. Then ask the agent, e.g.
"generate a lighthouse at sunset with comfyui qwen21_i2i_t2i in t2i mode, 16:9". It uses two tools:

| Tool                    | What it does                                                           |
| ----------------------- | ---------------------------------------------------------------------- |
| `comfy_workflow_inputs` | lists the workflows and their params, one short line each              |
| `comfy_generate`        | runs a workflow: `workflow`, `prompt`, `images` (file paths), `params` |

```json
{
  "workflow": "qwen21_i2i_t2i",
  "prompt": "a lighthouse on a cliff at sunset, oil painting",
  "params": {
    "режим": "t2i",
    "aspect": "16:9",
    "довга_сторона_результату": 1024
  }
}
```

Param names come from your node titles, in their language — see [Parameters](docs/parameters.md).

## Documentation

| Document                                                       | Contents                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| [Configuration](docs/configuration.md)                         | server URL, excluded workflows, timeout, prompt input    |
| [Parameters](docs/parameters.md)                               | the tool's arguments, param names, values, seeds         |
| [Troubleshooting](docs/troubleshooting.md)                     | common errors                                            |
| [Development](docs/development.md)                             | setup, scripts, parity test against the ComfyUI frontend |
| [Test results](docs/testing.md)                                | measured runs                                            |
| [Design](docs/specs/2026-10-03-comfy-image-provider-design.md) | the original design (v0.1, codemode image models)        |

## License

[Apache License 2.0](LICENSE); keep the [NOTICE](NOTICE) file when redistributing. ComfyUI and pi are separate projects
of their respective owners.
