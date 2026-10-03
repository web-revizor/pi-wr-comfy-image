// Prints the App Mode inputs of the reference workflows. Local only.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { appInputs, describeInputs, promptInput } from '../src/appInputs.js';
import { type ObjectInfo, type UiWorkflow } from '../src/comfy/types.js';
const info = (await (
  await fetch('http://127.0.0.1:8188/object_info')
).json()) as ObjectInfo;
const dir = path.resolve('test-results/reference');
for (const f of readdirSync(dir).filter((f) => f.endsWith('.workflow.json'))) {
  if (process.argv[2] && !f.startsWith(process.argv[2])) continue;
  const wf = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as UiWorkflow;
  const inputs = appInputs(wf, info);
  console.log(
    describeInputs(
      f.replace('.workflow.json', ''),
      inputs,
      promptInput(inputs, wf, info),
    ),
  );
}
