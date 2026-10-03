import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

export const CONFIG_FILE = path.join(
  os.homedir(),
  '.pi',
  'agent',
  'wr-comfy-image.json',
);
export const CACHE_FILE = path.join(
  os.homedir(),
  '.pi',
  'agent',
  'cache',
  'wr-comfy-image.json',
);

const ConfigSchema = z.object({
  /** ComfyUI server. */
  url: z.url().default('http://127.0.0.1:8188'),
  /** Workflows to leave out, as globs on the path under `workflows/`. */
  exclude: z.array(z.string()).default([]),
  /** How long one generation may take before the plugin stops waiting. */
  timeoutMs: z.number().int().positive().default(600_000),
  /** Per workflow: which input the prompt text goes to (`<nodeId>.<widget>`). */
  promptInput: z.record(z.string(), z.string()).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Reads the config; a missing file means defaults, a broken one is an error. */
export function loadConfig(file = CONFIG_FILE): Config {
  let raw: unknown = {};
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`${file}: ${(err as Error).message}`, { cause: err });
    }
  }
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${file}: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** `*` matches within a path segment, `**` across segments. */
export function globMatch(pattern: string, value: string): boolean {
  const re = pattern
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*'),
    )
    .join('.*');
  return new RegExp(`^${re}$`, 'i').test(value);
}
