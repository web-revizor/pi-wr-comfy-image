// Compares toApiPrompt() with the frontend's graphToPrompt() output written by
// scripts/reference.mjs. Local only. Usage: tsx scripts/parity.ts [name]
import { readdirSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { toApiPrompt } from '../src/convert/toApiPrompt.js';
import {
  type ApiPrompt,
  type ObjectInfo,
  type UiWorkflow,
} from '../src/comfy/types.js';

const dir = path.resolve('test-results/reference');
const base = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const info = (await (await fetch(`${base}/object_info`)).json()) as ObjectInfo;
const only = process.argv[2];

let failed = 0;
for (const file of readdirSync(dir).filter((f) =>
  f.endsWith('.workflow.json'),
)) {
  const name = file.replace('.workflow.json', '');
  if (only && name !== only) continue;
  const workflow = JSON.parse(
    readFileSync(path.join(dir, file), 'utf8'),
  ) as UiWorkflow;
  const ref = (
    JSON.parse(readFileSync(path.join(dir, `${name}.api.json`), 'utf8')) as {
      output: ApiPrompt;
    }
  ).output;
  let ours: ApiPrompt;
  try {
    ours = toApiPrompt(workflow, info);
  } catch (e) {
    console.log(`✗ ${name}: ${String(e)}`);
    failed++;
    continue;
  }
  const diffs: string[] = [];
  for (const id of new Set([...Object.keys(ref), ...Object.keys(ours)])) {
    const a = ref[id];
    const b = ours[id];
    if (!a) diffs.push(`  + ${id} ${b?.class_type} (only ours)`);
    else if (!b) diffs.push(`  - ${id} ${a.class_type} (only frontend)`);
    else if (a.class_type !== b.class_type)
      diffs.push(`  ~ ${id} class ${a.class_type} vs ${b.class_type}`);
    else {
      for (const k of new Set([
        ...Object.keys(a.inputs),
        ...Object.keys(b.inputs),
      ])) {
        if (!isDeepStrictEqual(a.inputs[k], b.inputs[k])) {
          diffs.push(
            `  ~ ${id} ${a.class_type}.${k}: frontend ${JSON.stringify(a.inputs[k])} ours ${JSON.stringify(b.inputs[k])}`,
          );
        }
      }
    }
  }
  if (diffs.length) failed++;
  console.log(
    `${diffs.length ? '✗' : '✓'} ${name} (${Object.keys(ref).length} nodes)`,
  );
  for (const d of diffs.slice(0, 25)) console.log(d);
}
process.exitCode = failed ? 1 : 0;
