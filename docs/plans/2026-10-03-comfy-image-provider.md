# pi-wr-comfy-image Implementation Plan

> Executed natively in the authoring session (the user asked for the plan and a working version in one go). Steps use
> checkbox syntax for tracking.

**Goal:** a pi package that registers every ComfyUI App Mode image workflow as a pi image model and runs it through
`generateImages`.

**Architecture:** pure modules (`convert/`, `appInputs`, `params`, `catalog` filtering) with unit tests on synthetic
fixtures; thin I/O modules (`comfyClient`, `runner`, `extension`) checked against the local ComfyUI and pi.

**Tech stack:** TypeScript strict, Node 24, zod 4, esbuild bundle (`@earendil-works/*` and `typebox` external), node:test
via tsx, ESLint + Prettier, playwright-core with the installed Chrome for the parity test.

**Spec:** [docs/specs/2026-10-03-comfy-image-provider-design.md](../specs/2026-10-03-comfy-image-provider-design.md)

## Global constraints

- pi ≥ 1.0.1 image API: models `type: "image"`, `api: "comfyui-images"`, `output: ["image", "text"]`, implementation
  under `images["comfyui-images"].generateImages`.
- No runtime dependencies outside the bundle; pi packages (`@earendil-works/*`, `typebox`) are peer dependencies.
- The plugin never starts or stops ComfyUI. One server, `url` from `~/.pi/agent/wr-comfy-image.json`.
- Images only. A workflow qualifies when one of its App Mode outputs is a node with an `IMAGE` input that
  `/object_info` marks as `output_node`.
- The user's workflows and reference outputs are never committed.

## Review focus

- A UI workflow with `SetNode`/`GetNode` (KJNodes) or Reroute chains: links must resolve to the real source.
- A subgraph whose input is a promoted widget with no link: the value comes from the instance's `widgets_values`.
- Seeds stored with `randomize`: a new value per run unless given, and the value used is reported.
- ComfyUI down at pi startup: models still listed from the cache; `generateImages` fails with a clear message.
- A JSON block with an unknown key or an out-of-range value: rejected before anything is queued.

---

### Task 1: Scaffold and tooling

**Files:** `package.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `.gitattributes`,
`.editorconfig`, `LICENSE`, `NOTICE`.

- [ ] `yarn verify` runs (typecheck, lint, format check, tests) on an empty `src/`.
- [ ] `yarn build` produces `dist/pi-wr-comfy-image.js`.

### Task 2: Types and `/object_info` model (`src/comfy/types.ts`, `src/comfy/objectInfo.ts`)

**Produces:** `UiWorkflow`, `UiNode`, `UiSubgraph`, `ApiPrompt`, `ObjectInfo`; `widgetInputs(info, classType):
WidgetSpec[]` (name, kind, choices, min, max, `control` = has `control_after_generate`, `upload` = has `image_upload`);
`isImageOutput(info, classType): boolean`.

- [ ] Tests: INT with `control_after_generate`, COMBO list and the new `COMBO` + `options` form, `image_upload`, output
      detection for `SaveImage` vs `SaveVideo`.

### Task 3: Converter (`src/convert/`)

**Produces:** `toApiPrompt(workflow: UiWorkflow, info: ObjectInfo): { prompt: ApiPrompt; nodeIds: Map<string, string> }`
where `nodeIds` maps a UI node id (`"105"`, `"104:99"`) to the API node id.

Steps, each test-first on a small fixture:

- [ ] widgets → named inputs, skipping `control_after_generate` and `image_upload` values;
- [ ] links (array form at top level, object form inside subgraphs) → `[sourceId, slot]`;
- [ ] widget converted to input and linked → the link wins;
- [ ] virtual nodes: Note/MarkdownNote dropped; Reroute followed; `PrimitiveNode` value pushed into targets;
      `SetNode`/`GetNode` resolved by name;
- [ ] mode 2 (muted) dropped; mode 4 (bypass) passes the first same-typed input through;
- [ ] subgraph flatten: inner ids `<instance>:<inner>`, input slots (`origin_id -10`) mapped to the instance's inputs
      (link, or promoted widget value), output slots (`target_id -20`) mapped to consumers; nested subgraphs;
- [ ] unknown class type or `widgets_values` count mismatch → `ConvertError` naming the node.

### Task 4: App Mode inputs (`src/appInputs.ts`)

**Produces:** `appInputs(workflow, info): AppInput[]` with `key` (`"118.value"`), `alias?`, `label`, `kind`, `default`,
`choices?`, `min?`, `max?`, `control?`, `promptCandidate`, `isImage`; `formatInputs(name, inputs): string` for the
tool output.

- [ ] Tests: alias only when the widget name is unique; labels from node titles; image inputs from `LoadImage`.

### Task 5: Parameters (`src/params.ts`)

**Produces:** `resolveParams(context: ImagesContext, inputs: AppInput[], opts: { promptInput?: string; random: () =>
number }): { values: Map<string, unknown>; images: { key: string; data: string; mimeType: string }[]; seeds:
Record<string, number> }`; throws `ParamsError` with the allowed keys / choices / range.

- [ ] Tests: prompt routing, JSON block detection, alias, unknown key, wrong type, out of range, combo choice,
      randomized seed, explicit seed, more images than image inputs.

### Task 6: ComfyUI client and catalog (`src/comfy/client.ts`, `src/catalog.ts`, `src/config.ts`)

**Produces:** `ComfyClient` (`objectInfo`, `listWorkflows`, `readWorkflow`, `uploadImage`, `queuePrompt`, `history`,
`view`, `cancel`); `loadConfig(): Config`; `buildCatalog(client, config): Promise<CatalogEntry[]>`;
`readCachedCatalog() / writeCachedCatalog()`.

- [ ] Tests: exclude globs, App Mode + image-output filter (pure part, synthetic entries).
- [ ] Live check against the local ComfyUI: the user's image workflows are found, video ones are not.

### Task 7: Runner (`src/runner.ts`)

**Produces:** `runWorkflow(client, entry, context, signal): Promise<AssistantImages-like result>`.

- [ ] Uploads images, applies values, submits with a client `prompt_id`, reports `node_errors`, polls `/history`,
      downloads image outputs, cancels by id on abort, times out with the prompt id.

### Task 8: pi extension (`src/extension.ts`)

- [ ] Registers provider `comfyui` (models from the catalog or cache, `images["comfyui-images"]`) and the tool
      `comfy_workflow_inputs`.
- [ ] `pi --list-models` with `--list-models` does not show image models; check with a codemode run instead.

### Task 9: Parity and real runs (local only)

- [ ] `scripts/parity.ts`: playwright-core + installed Chrome, frontend `graphToPrompt()` vs `toApiPrompt()` for every
      user App Mode image workflow; differences printed per node.
- [ ] One real generation with the cheapest workflow, small size, few steps; VRAM checked first; time and peak VRAM
      recorded in `docs/testing.md`.
- [ ] End to end: `pi -p` with codemode calling `models.generateImages()`.

### Task 10: Docs

- [ ] README (what, install, quick start, index) and `docs/configuration.md`, `docs/parameters.md`,
      `docs/troubleshooting.md`, `docs/development.md`.
