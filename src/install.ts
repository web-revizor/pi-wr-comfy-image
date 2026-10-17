import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_SUFFIX } from './catalog.js';
import { type ComfyClient } from './comfy/client.js';
import { type ObjectInfo, type UiWorkflow } from './comfy/types.js';

/** Folder under ComfyUI's `workflows/` the bundled workflows are copied to. */
export const INSTALL_DIR = 'pi-wr-comfy-image';

/** The package's `workflows/` folder, next to `dist/` and `src/`. */
export const BUNDLED_DIR = fileURLToPath(
  new URL('../workflows/', import.meta.url),
);

/** A model file a workflow loads that the server does not have. */
export interface MissingModel {
  name: string;
  directory: string;
  url: string;
}

export interface InstallResult {
  installed: string[];
  /** Already there: left as they are. */
  kept: string[];
  missing: MissingModel[];
}

interface ModelNote {
  name?: string;
  directory?: string;
  url?: string;
}

/** Model files named in the workflow's loader nodes that the server does not list. */
export function missingModels(
  workflow: UiWorkflow,
  info: ObjectInfo,
): MissingModel[] {
  const missing: MissingModel[] = [];
  for (const node of workflow.nodes) {
    const models = (node.properties?.models ?? []) as ModelNote[];
    for (const m of models) {
      if (!m.name || !m.url || !m.directory) continue;
      const offered = Object.values(info[node.type]?.input.required ?? {})
        .map(([type, opts]) => (Array.isArray(type) ? type : opts?.options))
        .some((list) => Array.isArray(list) && list.includes(m.name));
      if (!offered)
        missing.push({ name: m.name, directory: m.directory, url: m.url });
    }
  }
  return missing;
}

/**
 * Copies the bundled workflows into `workflows/<INSTALL_DIR>/` on the server.
 * An existing file is never overwritten, so edits made in ComfyUI stay.
 */
export async function installWorkflows(
  client: ComfyClient,
  info: ObjectInfo,
  dir = BUNDLED_DIR,
): Promise<InstallResult> {
  const result: InstallResult = { installed: [], kept: [], missing: [] };
  const seen = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(APP_SUFFIX))) {
    const body = readFileSync(path.join(dir, file), 'utf8');
    const target = `${INSTALL_DIR}/${file}`;
    if (await client.saveWorkflow(target, body)) result.installed.push(target);
    else result.kept.push(target);
    for (const m of missingModels(JSON.parse(body) as UiWorkflow, info)) {
      if (seen.has(m.name)) continue;
      seen.add(m.name);
      result.missing.push(m);
    }
  }
  return result;
}
