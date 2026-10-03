import { type InputSpec, type NodeDef, type ObjectInfo } from './types.js';

/** Input types that carry data between nodes; everything else is a widget. */
const WIDGET_PRIMITIVES = new Set([
  'INT',
  'FLOAT',
  'STRING',
  'BOOLEAN',
  'COMBO',
]);

export type WidgetKind = 'int' | 'float' | 'string' | 'boolean' | 'combo';

export interface WidgetSpec {
  name: string;
  kind: WidgetKind;
  choices?: string[];
  min?: number;
  max?: number;
  multiline?: boolean;
  /** The frontend stores a control mode (fixed / randomize / …) right after the value. */
  control: boolean;
  /** Dynamic combo: the extra widgets each option brings, saved as `<name>.<sub>`. */
  dynamic?: Record<string, WidgetSpec[]>;
  /** What the frontend fills in when a saved workflow predates the widget. */
  default?: unknown;
  /** A file picker for an input image (`LoadImage.image`). */
  upload?: boolean;
}

/** The frontend adds a control widget to these by name, flag or not. */
const SEED_NAMES = new Set(['seed', 'noise_seed']);

function allInputs(def: NodeDef): [string, InputSpec][] {
  const required = def.input.required ?? {};
  const optional = def.input.optional ?? {};
  const order = [
    ...(def.input_order?.required ?? Object.keys(required)),
    ...(def.input_order?.optional ?? Object.keys(optional)),
  ];
  return order
    .map((name): [string, InputSpec | undefined] => [
      name,
      required[name] ?? optional[name],
    ])
    .filter((e): e is [string, InputSpec] => e[1] !== undefined);
}

function dynamicOptions(
  options: unknown[],
): Record<string, WidgetSpec[]> | undefined {
  const out: Record<string, WidgetSpec[]> = {};
  for (const o of options) {
    if (!o || typeof o !== 'object' || !('key' in o)) return undefined;
    const inputs = (o as { inputs?: NodeDef['input'] }).inputs ?? {};
    out[String(o.key)] = allInputs({
      input: inputs,
      output: [],
      output_node: false,
    })
      .map(([name, spec]) => toWidget(name, spec))
      .filter((w): w is WidgetSpec => w !== undefined);
  }
  return out;
}

function toWidget(name: string, spec: InputSpec): WidgetSpec | undefined {
  const widget = toWidgetKind(name, spec);
  const opts = spec[1] ?? {};
  if (widget && 'default' in opts) widget.default = opts.default;
  if (widget && opts.image_upload) widget.upload = true;
  return widget;
}

function toWidgetKind(name: string, spec: InputSpec): WidgetSpec | undefined {
  const [declared, opts = {}] = spec;
  // Multi-type inputs ("FLOAT,INT") name the widget they show.
  const type =
    typeof declared === 'string' &&
    declared.includes(',') &&
    typeof opts.widgetType === 'string'
      ? opts.widgetType
      : declared;
  const control =
    Boolean(opts.control_after_generate) ||
    (type === 'INT' && SEED_NAMES.has(name));
  const num = (k: string): number | undefined =>
    typeof opts[k] === 'number' ? opts[k] : undefined;
  if (Array.isArray(type)) {
    return { name, kind: 'combo', choices: type.map(String), control };
  }
  if (!WIDGET_PRIMITIVES.has(type) && !type.includes('COMBO')) return undefined;
  if (type === 'INT' || type === 'FLOAT') {
    return {
      name,
      kind: type === 'INT' ? 'int' : 'float',
      min: num('min'),
      max: num('max'),
      control,
    };
  }
  if (type === 'STRING') {
    return {
      name,
      kind: 'string',
      multiline: Boolean(opts.multiline),
      control,
    };
  }
  if (type === 'BOOLEAN') return { name, kind: 'boolean', control };
  const raw: unknown[] = Array.isArray(opts.options) ? opts.options : [];
  const dynamic = type.includes('DYNAMICCOMBO')
    ? dynamicOptions(raw)
    : undefined;
  const choices = dynamic
    ? Object.keys(dynamic)
    : raw.length
      ? raw.map(String)
      : undefined;
  return { name, kind: 'combo', choices, control, dynamic };
}

/** The node's widgets in definition order (required, then optional). */
export function widgetSpecs(info: ObjectInfo, classType: string): WidgetSpec[] {
  const def = info[classType];
  if (!def) return [];
  return allInputs(def)
    .map(([name, spec]) => toWidget(name, spec))
    .filter((w): w is WidgetSpec => w !== undefined);
}

export function inputSpec(
  info: ObjectInfo,
  classType: string,
  name: string,
): InputSpec | undefined {
  const def = info[classType];
  return def?.input.required?.[name] ?? def?.input.optional?.[name];
}

/** An output node that takes images: SaveImage, PreviewImage, SaveImageAdvanced, … */
export function isImageOutput(info: ObjectInfo, classType: string): boolean {
  const def = info[classType];
  if (!def?.output_node) return false;
  return allInputs(def).some(([, [type]]) => type === 'IMAGE');
}
