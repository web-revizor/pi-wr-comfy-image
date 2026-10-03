import { randomUUID } from 'node:crypto';
import { type CatalogEntry } from './catalog.js';
import {
  type ComfyClient,
  ComfyRequestError,
  type HistoryEntry,
} from './comfy/client.js';
import {
  type ApiPrompt,
  type ObjectInfo,
  type UiWorkflow,
} from './comfy/types.js';
import { toApiPrompt } from './convert/toApiPrompt.js';
import { type InputBlock, resolveParams } from './params.js';

export class RunError extends Error {}

export interface GeneratedImage {
  data: string;
  mimeType: string;
  /** Where ComfyUI saved it: `<type>/<subfolder>/<filename>`. */
  file: string;
}

export interface RunResult {
  promptId: string;
  images: GeneratedImage[];
  seeds: Record<string, number>;
  seconds: number;
}

export interface RunOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  random?: () => number;
  pollMs?: number;
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

function extOf(mimeType: string): string {
  return mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
}

/** `node_errors` from a rejected `/prompt`, one line per node. */
export function formatNodeErrors(body: unknown, prompt: ApiPrompt): string {
  const b = body as {
    error?: { message?: string; details?: string };
    node_errors?: Record<
      string,
      { errors?: { message?: string; details?: string }[]; class_type?: string }
    >;
  };
  const lines: string[] = [];
  for (const [id, e] of Object.entries(b?.node_errors ?? {})) {
    const title = prompt[id]?._meta?.title ?? e.class_type ?? id;
    for (const err of e.errors ?? []) {
      lines.push(
        `"${title}" (#${id}): ${err.message ?? ''}${err.details ? ` - ${err.details}` : ''}`,
      );
    }
  }
  if (!lines.length && b?.error) {
    lines.push(
      `${b.error.message ?? 'rejected'}${b.error.details ? ` - ${b.error.details}` : ''}`,
    );
  }
  return lines.join('\n') || 'ComfyUI rejected the prompt';
}

function executionError(
  entry: HistoryEntry,
  prompt: ApiPrompt,
): string | undefined {
  for (const [type, data] of entry.status?.messages ?? []) {
    if (type !== 'execution_error') continue;
    const text = (v: unknown, fallback: string): string =>
      typeof v === 'string' || typeof v === 'number' ? String(v) : fallback;
    const id = text(data.node_id, '');
    const title = prompt[id]?._meta?.title ?? text(data.node_type, id);
    return `"${title}" (#${id}): ${text(data.exception_message, 'failed').trim()}`;
  }
  return entry.status?.status_str === 'error' ? 'execution failed' : undefined;
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** Runs one App Mode workflow with the given input and returns its images. */
export async function runWorkflow(
  client: ComfyClient,
  entry: CatalogEntry,
  workflow: UiWorkflow,
  info: ObjectInfo,
  input: InputBlock[],
  opts: RunOptions,
): Promise<RunResult> {
  const started = Date.now();
  const prompt = entry.inputs.find((i) => i.key === entry.prompt);
  const params = resolveParams(input, entry.inputs, prompt, opts.random);

  for (const [n, image] of params.images.entries()) {
    const name = await client.uploadImage(
      Buffer.from(image.data, 'base64'),
      `pi-${randomUUID().slice(0, 8)}-${n + 1}.${extOf(image.mimeType)}`,
      image.mimeType,
    );
    params.values.set(image.key, name);
  }

  const apiPrompt = toApiPrompt(workflow, info, params.values);
  const promptId = randomUUID();
  try {
    await client.queuePrompt(apiPrompt, promptId);
  } catch (err) {
    if (err instanceof ComfyRequestError && err.status === 400) {
      throw new RunError(formatNodeErrors(err.body, apiPrompt));
    }
    throw err;
  }

  const deadline = started + opts.timeoutMs;
  let done: HistoryEntry | undefined;
  while (!done) {
    if (opts.signal?.aborted) {
      await client.cancel(promptId).catch(() => undefined);
      throw new RunError(`cancelled (prompt ${promptId})`);
    }
    if (Date.now() > deadline) {
      throw new RunError(
        `no result after ${Math.round(opts.timeoutMs / 1000)} s - ComfyUI keeps prompt ${promptId}`,
      );
    }
    const entryNow = await client.history(promptId);
    const failure = entryNow ? executionError(entryNow, apiPrompt) : undefined;
    if (failure) throw new RunError(failure);
    if (entryNow?.status?.completed) done = entryNow;
    else await sleep(opts.pollMs ?? 1000, opts.signal);
  }

  const wanted = new Set(
    (workflow.extra?.linearData?.outputs ?? []).map(String),
  );
  const outputs = Object.entries(done.outputs ?? {});
  const chosen = outputs.some(([id]) => wanted.has(id))
    ? outputs.filter(([id]) => wanted.has(id))
    : outputs;
  const images: GeneratedImage[] = [];
  for (const [, out] of chosen) {
    for (const img of out.images ?? []) {
      const ext = img.filename.split('.').pop()?.toLowerCase() ?? 'png';
      const data = await client.view(img);
      images.push({
        data: data.toString('base64'),
        mimeType: MIME[ext] ?? 'image/png',
        file: [img.type, img.subfolder, img.filename].filter(Boolean).join('/'),
      });
    }
  }
  if (!images.length)
    throw new RunError(`prompt ${promptId} finished without images`);
  return {
    promptId,
    images,
    seeds: params.seeds,
    seconds: Math.round((Date.now() - started) / 100) / 10,
  };
}
