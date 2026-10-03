# Development

Yarn Classic, Node 24. pi and `typebox` are peer dependencies (provided by pi at runtime); everything else is bundled
into `dist/pi-wr-comfy-image.js` by esbuild.

```bash
yarn                 # dependencies + build (prepare)
yarn verify          # typecheck, lint, format check, unit tests
yarn build           # dist/pi-wr-comfy-image.js
pi -e ./dist/pi-wr-comfy-image.js   # try it without installing
```

## Layout

| File                         | Role                                                                    |
| ---------------------------- | ----------------------------------------------------------------------- |
| `src/extension.ts`           | pi entry: provider `comfyui` (image models) and `comfy_workflow_inputs` |
| `src/catalog.ts`             | finds App Mode image workflows, cache                                   |
| `src/convert/toApiPrompt.ts` | UI → API conversion                                                     |
| `src/appInputs.ts`           | App Mode inputs: keys, aliases, labels, types, choices                  |
| `src/params.ts`              | `generateImages` input → values, images, seeds                          |
| `src/runner.ts`              | upload, queue, wait, download, cancel                                   |
| `src/comfy/`                 | HTTP client, `/object_info` reading, types                              |
| `src/config.ts`              | config file and globs                                                   |

## Local checks against a real ComfyUI

These use the user's workflows and are never committed (`test-results/` is ignored).

```bash
node scripts/reference.mjs       # frontend graphToPrompt() for every App Mode workflow (playwright-core + installed Chrome)
npx tsx scripts/parity.ts        # our conversion vs the frontend's, node by node
npx tsx scripts/inputs.ts [name] # what comfy_workflow_inputs would show
npx tsx scripts/run.ts <id> "<prompt>" '<json>'   # one real generation, images to test-results/runs/
```

Run `reference.mjs` again after updating ComfyUI or its frontend, then `parity.ts`.
