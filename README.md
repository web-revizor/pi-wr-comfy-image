# pi-wr-comfy-image

ComfyUI as a native [pi](https://github.com/earendil-works/pi) image-model provider. Every **App Mode** workflow you save
in ComfyUI that produces images becomes an image model of the `comfyui` provider, and an agent runs it from codemode with
`models.generateImages()` — prompt, input images and any input App Mode exposes, no annotations needed.

- Works with any workflow: the plugin converts ComfyUI's UI format itself (subgraphs, Set/Get nodes, reroutes, bypassed
  and muted nodes), checked node by node against ComfyUI's own frontend.
- Inputs come from App Mode: what you exposed in the UI is what the agent can set, with your node titles as labels.
- Images come back to the agent and stay saved in ComfyUI's `output/`.

## Quick start

Requirements: pi ≥ 1.0.1, Node 24, a running ComfyUI (≥ 0.38).

```bash
pi install git:github.com/web-revizor/pi-wr-comfy-image@v0.1.0
```

In ComfyUI, open a workflow, switch to App Mode, pick the inputs to expose and save it. Then in pi:

```js
// codemode script
// @options: {"timeout_ms": 600000}
const r = await models.generateImages(
  { provider: 'comfyui', id: 'flux2_klein9b_i2i_t2i' },
  {
    input: [
      { type: 'text', text: 'a lighthouse on a cliff at sunset, oil painting' },
      {
        type: 'text',
        text: JSON.stringify({ aspect: '16:9', '107.value': 1024 }),
      },
    ],
  },
);
for (const b of r.output) b.type === 'image' ? image(b) : text(b.text);
```

The `comfy_workflow_inputs` tool lists every model's inputs, keys, defaults and choices.

## Documentation

| Document                                                       | Contents                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| [Configuration](docs/configuration.md)                         | server URL, excluded workflows, timeout, prompt input    |
| [Parameters](docs/parameters.md)                               | how prompt, images and the JSON block map to App Mode    |
| [Troubleshooting](docs/troubleshooting.md)                     | common errors                                            |
| [Development](docs/development.md)                             | setup, scripts, parity test against the ComfyUI frontend |
| [Test results](docs/testing.md)                                | measured runs                                            |
| [Design](docs/specs/2026-10-03-comfy-image-provider-design.md) | the agreed design                                        |

## License

[Apache License 2.0](LICENSE); keep the [NOTICE](NOTICE) file when redistributing. ComfyUI and pi are separate projects
of their respective owners.
