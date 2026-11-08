import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  type AppInput,
  appInputs,
  MODEL_FILE,
  promptInput,
  unresolvedInputs,
} from './appInputs.js';
import { type ComfyClient } from './comfy/client.js';
import { inputSpec, isImageOutput } from './comfy/objectInfo.js';
import {
  type ObjectInfo,
  type UiNode,
  type UiWorkflow,
} from './comfy/types.js';
import { type Config, globMatch } from './config.js';
import { ConvertError, toApiPrompt } from './convert/toApiPrompt.js';

/** One App Mode image workflow offered by the tools. */
export interface CatalogEntry {
  /** Workflow name: the path under `workflows/` without `.app.json`. */
  id: string;
  file: string;
  modified: number;
  inputs: AppInput[];
  /** Key of the input the prompt text goes to. */
  prompt?: string;
  /** Model files or node types the workflow needs and the server lacks. */
  missing?: string[];
  /** App Mode inputs that could not be matched to a widget. */
  unresolved?: string[];
}

export const APP_SUFFIX = '.app.json';

function findNode(workflow: UiWorkflow, id: string): UiNode | undefined {
  const all = [
    ...workflow.nodes,
    ...(workflow.definitions?.subgraphs ?? []).flatMap((s) => s.nodes),
  ];
  return all.find((n) => String(n.id) === id);
}

/** App Mode, with at least one output that saves or previews images. */
export function isImageApp(workflow: UiWorkflow, info: ObjectInfo): boolean {
  const outputs = workflow.extra?.linearData?.outputs ?? [];
  return outputs.some((id) => {
    const node = findNode(workflow, String(id).split(':').at(-1) ?? '');
    return node !== undefined && isImageOutput(info, node.type);
  });
}

export function modelId(file: string): string {
  return file.slice(0, -APP_SUFFIX.length);
}

export function selectFiles(
  files: { path: string; modified: number }[],
  exclude: string[],
): { path: string; modified: number }[] {
  return files.filter(
    (f) =>
      f.path.endsWith(APP_SUFFIX) && !exclude.some((p) => globMatch(p, f.path)),
  );
}

/** What the workflow loads by default that this ComfyUI cannot provide. */
export function missingFiles(
  workflow: UiWorkflow,
  info: ObjectInfo,
  overrides?: Map<string, unknown>,
): string[] {
  let prompt;
  try {
    prompt = toApiPrompt(workflow, info, overrides);
  } catch (err) {
    if (err instanceof ConvertError) return [err.message];
    throw err;
  }
  const missing = new Set<string>();
  for (const node of Object.values(prompt)) {
    for (const [name, value] of Object.entries(node.inputs)) {
      if (typeof value !== 'string' || !MODEL_FILE.test(value)) continue;
      const [type, opts = {}] = inputSpec(info, node.class_type, name) ?? [];
      const list = Array.isArray(type) ? type : opts.options;
      if (Array.isArray(list) && !list.includes(value)) missing.add(value);
    }
  }
  return [...missing];
}

export function catalogEntry(
  file: string,
  modified: number,
  workflow: UiWorkflow,
  info: ObjectInfo,
  config: Config,
): CatalogEntry {
  const id = modelId(file);
  const inputs = appInputs(workflow, info);
  const configured = config.promptInput[id];
  const prompt = configured
    ? inputs.find((i) => i.key === configured)
    : promptInput(inputs, workflow, info);
  const missing = missingFiles(workflow, info);
  const unresolved = unresolvedInputs(workflow, inputs);
  return {
    id,
    file,
    modified,
    inputs,
    prompt: prompt?.key,
    ...(missing.length ? { missing } : {}),
    ...(unresolved.length ? { unresolved } : {}),
  };
}

export interface Catalog {
  entries: CatalogEntry[];
  workflows: Map<string, UiWorkflow>;
  info: ObjectInfo;
}

/** Reads every App Mode image workflow from ComfyUI. Throws when it is down. */
export async function buildCatalog(
  client: ComfyClient,
  config: Config,
): Promise<Catalog> {
  const info = await client.objectInfo();
  const files = selectFiles(await client.listWorkflows(), config.exclude);
  const entries: CatalogEntry[] = [];
  const workflows = new Map<string, UiWorkflow>();
  for (const f of files) {
    const workflow = await client.readWorkflow(f.path);
    if (!isImageApp(workflow, info)) continue;
    const entry = catalogEntry(f.path, f.modified, workflow, info, config);
    entries.push(entry);
    workflows.set(entry.id, workflow);
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return { entries, workflows, info };
}

export function readCache(file: string): CatalogEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      entries?: CatalogEntry[];
    };
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

export function writeCache(file: string, entries: CatalogEntry[]): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ entries }, null, 2)}\n`);
}
