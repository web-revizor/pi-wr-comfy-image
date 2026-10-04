// Prints the one-line workflow summaries the comfy_generate description carries. Local only.
import { buildCatalog } from '../src/catalog.js';
import { summaryLine } from '../src/appInputs.js';
import { ComfyClient } from '../src/comfy/client.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig();
const { entries } = await buildCatalog(new ComfyClient(config.url), config);
const text = entries
  .map((e) =>
    summaryLine(
      e.id,
      e.inputs,
      e.inputs.find((i) => i.key === e.prompt),
    ),
  )
  .join('\n');
console.log(text);
console.log(`${text.length} chars`);
