// Checks the App Mode image workflows on a running ComfyUI. Local only.
// Reports App Mode inputs that no longer resolve, saved list values the server
// does not offer (models not installed, renamed options) and param names or
// short choices ("i2i" of "i2i — repaint") that are not plain ASCII.
// Exit code 1 when anything is found.
import { shortChoice } from '../src/appInputs.js';
import { buildCatalog } from '../src/catalog.js';
import { ComfyClient } from '../src/comfy/client.js';
import { inputSpec } from '../src/comfy/objectInfo.js';
import { loadConfig } from '../src/config.js';
import { toApiPrompt } from '../src/convert/toApiPrompt.js';

const NON_ASCII = /[^\x20-\x7e]/;

const only = process.argv[2];
const config = loadConfig();
const { entries, workflows, info } = await buildCatalog(
  new ComfyClient(config.url),
  config,
);
let problems = 0;
for (const e of entries) {
  if (only && e.id !== only) continue;
  const workflow = workflows.get(e.id);
  if (!workflow) continue;
  const found: string[] = [];
  const exposed = workflow.extra?.linearData?.inputs ?? [];
  if (exposed.length !== e.inputs.length) {
    const keys = new Set(e.inputs.map((i) => i.key));
    for (const [id, widget] of exposed) {
      if (!keys.has(`${id}.${widget}`))
        found.push(`App Mode input ${id}.${widget} does not resolve`);
    }
  }
  for (const i of e.inputs) {
    if (NON_ASCII.test(i.name)) found.push(`param name "${i.name}" (${i.key})`);
    for (const c of i.choices ?? []) {
      if (
        NON_ASCII.test(shortChoice(c)) &&
        !/\.(safetensors|gguf|ckpt|pt|pth)$/i.test(c)
      )
        found.push(`choice "${c}" of ${i.name}`);
    }
  }
  const prompt = toApiPrompt(workflow, info, new Map());
  for (const [id, node] of Object.entries(prompt)) {
    for (const [name, value] of Object.entries(node.inputs)) {
      if (typeof value !== 'string') continue;
      const [type, opts = {}] = inputSpec(info, node.class_type, name) ?? [];
      const list = Array.isArray(type)
        ? type
        : // An empty list is filled per node by the frontend (CustomCombo).
          Array.isArray(opts.options) &&
            opts.options.length > 0 &&
            opts.options.every((o) => typeof o === 'string')
          ? (opts.options as string[])
          : undefined;
      if (list && !list.includes(value)) {
        found.push(
          `#${id} ${node._meta?.title ?? node.class_type}: ${name} = "${value}" not offered by the server`,
        );
      }
    }
  }
  problems += found.length;
  console.log(`${e.id}: ${found.length ? '' : 'ok'}`);
  for (const f of found) console.log(`  - ${f}`);
}
console.log(`${problems} problem(s)`);
process.exitCode = problems ? 1 : 0;
