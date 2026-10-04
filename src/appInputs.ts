import { widgetSpecs, type WidgetKind } from './comfy/objectInfo.js';
import { type ObjectInfo, type UiWorkflow } from './comfy/types.js';
import { savedNode } from './convert/toApiPrompt.js';
import { shortNames } from './names.js';

/** One input App Mode exposes, described for the agent and for validation. */
export interface AppInput {
  /** `<nodePath>.<widget>`, e.g. `118.value`. */
  key: string;
  /** Short unique name for tool calls: `mode`, `seed`, `cfg`. */
  name: string;
  /** The node title - users write these as instructions. */
  label: string;
  kind: WidgetKind | 'image';
  default: unknown;
  choices?: string[];
  min?: number;
  max?: number;
  /** Saved control mode of a seed-like value (`randomize`, `fixed`, …). */
  control?: string;
}

/** Inputs App Mode exposes, in its order. Inputs that no longer resolve are skipped. */
export function appInputs(workflow: UiWorkflow, info: ObjectInfo): AppInput[] {
  const linear = workflow.extra?.linearData?.inputs ?? [];
  const inputs: AppInput[] = [];
  for (const [rawId, widget] of linear) {
    const path = String(rawId);
    const saved = savedNode(workflow, info, path);
    if (!saved) continue;
    const { node, values, controls } = saved;
    const spec = widgetSpecs(info, node.type).find((w) => w.name === widget);
    const value = values.get(widget);
    const input: AppInput = {
      key: `${path}.${widget}`,
      name: '',
      label: node.title ?? node.type,
      kind: spec?.upload ? 'image' : (spec?.kind ?? kindOf(value)),
      default: value,
    };
    const choices =
      node.type === 'CustomCombo' && widget === 'choice'
        ? customComboOptions(node.widgets_values)
        : spec?.choices;
    if (choices?.length && input.kind !== 'image') input.choices = choices;
    if (spec?.min !== undefined) input.min = spec.min;
    if (spec?.max !== undefined) input.max = spec.max;
    const control = controls.get(widget);
    if (control) input.control = control;
    inputs.push(input);
  }
  const names = shortNames(
    inputs.map((i) => ({
      key: i.key,
      label: i.label,
      widget: widgetOf(i.key),
    })),
  );
  inputs.forEach((i, n) => (i.name = names[n] ?? i.key));
  return inputs;
}

export function widgetOf(key: string): string {
  return key.slice(key.indexOf('.') + 1);
}

function kindOf(value: unknown): WidgetKind {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number')
    return Number.isInteger(value) ? 'int' : 'float';
  return 'string';
}

function customComboOptions(wv: unknown): string[] {
  return Array.isArray(wv)
    ? wv
        .slice(2)
        .map(String)
        .filter((o) => o !== '')
    : [];
}

/** The text input the prompt goes to: the first multi-line string App Mode exposes. */
export function promptInput(
  inputs: AppInput[],
  workflow: UiWorkflow,
  info: ObjectInfo,
): AppInput | undefined {
  return inputs.find((i) => {
    if (i.kind !== 'string') return false;
    const [path = ''] = i.key.split('.');
    const saved = savedNode(workflow, info, path);
    const spec = saved
      ? widgetSpecs(info, saved.node.type).find(
          (w) => w.name === widgetOf(i.key),
        )
      : undefined;
    return spec?.multiline ?? false;
  });
}

/** A choice without its explanation: "t2i — з нуля" -> "t2i". */
export function shortChoice(choice: string): string {
  return (choice.split(/\s+[—–-]\s+|\s+\(/)[0] ?? choice).trim();
}

/** Short forms of the choices when they stay distinct, the choices otherwise. */
export function displayChoices(choices: string[]): string[] {
  const short = choices.map(shortChoice);
  return new Set(short).size === short.length ? short : choices;
}

const MAX_LISTED_CHOICES = 12;

/** A combo of model files: listing them only buries the useful inputs. */
function isFileChoice(choices: string[]): boolean {
  return choices.some((c) =>
    /\.(safetensors|ckpt|pt|pth|gguf|bin|onnx)$/i.test(c),
  );
}

/** Compact description of a workflow's inputs, for the `comfy_workflow_inputs` tool. */
export function describeInputs(
  id: string,
  inputs: AppInput[],
  prompt: AppInput | undefined,
  verbose = false,
): string {
  const lines = [id];
  if (prompt) lines.push('  prompt: text');
  const images = inputs.filter((i) => i.kind === 'image');
  if (images.length) {
    lines.push(
      `  images: ${images.length} (${images.map((i) => i.name).join(', ')})`,
    );
  }
  for (const i of inputs) {
    if (i === prompt || i.kind === 'image') continue;
    let type: string;
    if (i.choices && isFileChoice(i.choices) && !verbose) {
      type = `file, ${i.choices.length} available`;
    } else if (i.choices) {
      const shown = displayChoices(i.choices);
      type =
        shown.length > MAX_LISTED_CHOICES && !verbose
          ? `one of ${shown.length} choices`
          : shown.map((c) => JSON.stringify(c)).join(' | ');
    } else {
      type = `${i.kind}${range(i)}`;
    }
    const current =
      i.control === 'randomize'
        ? 'random each run'
        : `= ${JSON.stringify(i.choices ? shortChoice(String(i.default)) : i.default)}`;
    const label = verbose ? `  # ${i.label} [${i.key}]` : '';
    lines.push(`  ${i.name}: ${type} (${current})${label}`);
  }
  return lines.join('\n');
}

function range(i: AppInput): string {
  if (i.min === undefined && i.max === undefined) return '';
  const fmt = (n?: number): string =>
    n === undefined || Math.abs(n) > 1e15 ? '' : String(n);
  const text = `${fmt(i.min)}..${fmt(i.max)}`;
  return text === '..' ? '' : ` ${text}`;
}
