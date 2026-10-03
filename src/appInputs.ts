import { widgetSpecs, type WidgetKind } from './comfy/objectInfo.js';
import { type ObjectInfo, type UiWorkflow } from './comfy/types.js';
import { savedNode } from './convert/toApiPrompt.js';

/** One input App Mode exposes, described for the agent and for validation. */
export interface AppInput {
  /** `<nodePath>.<widget>`, e.g. `118.value`. */
  key: string;
  /** The widget name when no other input of the workflow shares it. */
  alias?: string;
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
  const counts = new Map<string, number>();
  for (const i of inputs) {
    const name = widgetOf(i.key);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  for (const i of inputs) {
    const name = widgetOf(i.key);
    if (counts.get(name) === 1) i.alias = name;
  }
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

/** One line per input, for the `comfy_workflow_inputs` tool. */
export function describeInputs(
  id: string,
  inputs: AppInput[],
  prompt: AppInput | undefined,
): string {
  const lines = [`${id}`];
  let image = 0;
  for (const i of inputs) {
    const role =
      i === prompt
        ? 'prompt ← '
        : i.kind === 'image'
          ? `image#${++image} ← `
          : '';
    const name = i.alias ? `${i.key} (${i.alias})` : i.key;
    const detail = i.choices
      ? `one of: ${i.choices.map((c) => JSON.stringify(c)).join(', ')}`
      : i.kind === 'image'
        ? 'image'
        : `${i.kind}${range(i)} = ${JSON.stringify(i.default)}${i.control ? `, ${i.control}` : ''}`;
    lines.push(`  ${role}${name} — ${i.label} — ${detail}`);
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
