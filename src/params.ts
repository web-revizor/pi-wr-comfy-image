import {
  type AppInput,
  displayChoices,
  shortChoice,
  widgetOf,
} from './appInputs.js';

/** The tool call as content blocks: text blocks and base64 image blocks. */
export type InputBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export class ParamsError extends Error {}

export interface ImageUpload {
  key: string;
  data: string;
  mimeType: string;
}

export interface ResolvedParams {
  /** Overrides for the conversion, `<nodePath>.<widget>` -> value. */
  values: Map<string, unknown>;
  /** Images to upload; their file names go into `values` under the same key. */
  images: ImageUpload[];
  /** Seeds used, for the reply, keyed like `values`. */
  seeds: Record<string, number>;
}

/** Largest seed ComfyUI accepts everywhere (JS-safe, below 2^53). */
const SEED_MAX = 2 ** 50;

function parseJsonBlock(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function allowedKeys(inputs: AppInput[]): string {
  return inputs.map((i) => i.name).join(', ');
}

/** The full choice for an exact value, its short form, or a unique prefix. */
function matchChoice(choices: string[], value: string): string | undefined {
  const v = value.trim().toLowerCase();
  const exact = choices.find(
    (c) => c.toLowerCase() === v || shortChoice(c).toLowerCase() === v,
  );
  if (exact !== undefined) return exact;
  const prefixed = choices.filter((c) => c.toLowerCase().startsWith(v));
  return prefixed.length === 1 ? prefixed[0] : undefined;
}

function checkValue(input: AppInput, value: unknown): unknown {
  const fail: (what: string) => never = (what) => {
    throw new ParamsError(`${input.name}: ${what}`);
  };
  if (input.choices) {
    const choice = matchChoice(input.choices, String(value));
    if (choice === undefined) {
      fail(
        `must be one of ${displayChoices(input.choices)
          .map((c) => JSON.stringify(c))
          .join(', ')}`,
      );
    }
    return choice;
  }
  switch (input.kind) {
    case 'int':
    case 'float': {
      // Smaller models often quote numbers: "1024" is meant as 1024.
      const n =
        typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : value;
      if (typeof n !== 'number' || Number.isNaN(n)) fail('must be a number');
      if (input.kind === 'int' && !Number.isInteger(n))
        fail('must be an integer');
      if (input.min !== undefined && n < input.min)
        fail(`must be ≥ ${input.min}`);
      if (input.max !== undefined && n > input.max)
        fail(`must be ≤ ${input.max}`);
      return n;
    }
    case 'boolean': {
      const b = value === 'true' ? true : value === 'false' ? false : value;
      if (typeof b !== 'boolean') fail('must be true or false');
      return b;
    }
    case 'string':
      if (typeof value !== 'string') fail('must be a string');
      return value;
    default:
      return fail('is an image input - pass it in `images`');
  }
}

/**
 * Turns the tool input blocks into values for the workflow: plain text goes
 * to the prompt input, images to the image inputs in App Mode order, and a text
 * block that is a JSON object sets inputs by short name or key. Nothing is accepted
 * that the workflow does not expose.
 */
export function resolveParams(
  input: InputBlock[],
  inputs: AppInput[],
  prompt: AppInput | undefined,
  random: () => number = Math.random,
): ResolvedParams {
  const values = new Map<string, unknown>();
  const images: ImageUpload[] = [];
  const texts: string[] = [];
  const byName = new Map<string, AppInput>();
  const widgetCount = new Map<string, number>();
  for (const i of inputs) {
    const w = widgetOf(i.key);
    widgetCount.set(w, (widgetCount.get(w) ?? 0) + 1);
  }
  for (const i of inputs) {
    byName.set(i.key, i);
    byName.set(i.name, i);
    if (widgetCount.get(widgetOf(i.key)) === 1) byName.set(widgetOf(i.key), i);
  }

  const imageInputs = inputs.filter((i) => i.kind === 'image');
  for (const block of input) {
    if (block.type === 'image') {
      const target = imageInputs[images.length];
      if (!target) {
        throw new ParamsError(
          `this workflow takes ${imageInputs.length} image(s), got more`,
        );
      }
      images.push({
        key: target.key,
        data: block.data,
        mimeType: block.mimeType,
      });
      continue;
    }
    const json = parseJsonBlock(block.text);
    if (!json) {
      texts.push(block.text);
      continue;
    }
    for (const [name, value] of Object.entries(json)) {
      const target = byName.get(name);
      if (!target) {
        throw new ParamsError(
          `unknown input "${name}"; allowed: ${allowedKeys(inputs)}`,
        );
      }
      values.set(target.key, checkValue(target, value));
    }
  }

  const text = texts.join('\n').trim();
  if (text) {
    if (!prompt) throw new ParamsError('this workflow exposes no prompt input');
    if (!values.has(prompt.key)) values.set(prompt.key, text);
  }

  const seeds: Record<string, number> = {};
  for (const i of inputs) {
    if (i.control === undefined || i.kind !== 'int') continue;
    if (!values.has(i.key) && i.control === 'randomize') {
      values.set(i.key, Math.floor(random() * SEED_MAX));
    }
    const used = values.get(i.key) ?? i.default;
    if (typeof used === 'number' && /seed/i.test(`${i.key} ${i.label}`)) {
      seeds[i.key] = used;
    }
  }
  return { values, images, seeds };
}
