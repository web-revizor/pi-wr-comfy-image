import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type AppInput, appInputs, promptInput } from './appInputs.js';
import { type ComfyClient } from './comfy/client.js';
import { isImageOutput } from './comfy/objectInfo.js';
import {
  type ObjectInfo,
  type UiNode,
  type UiWorkflow,
} from './comfy/types.js';
import { type Config, globMatch } from './config.js';

/** One App Mode workflow offered to pi as an image model. */
export interface CatalogEntry {
  /** Model id: the path under `workflows/` without `.app.json`. */
  id: string;
  file: string;
  modified: number;
  inputs: AppInput[];
  /** Key of the input the prompt text goes to. */
  prompt?: string;
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
  return { id, file, modified, inputs, prompt: prompt?.key };
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
