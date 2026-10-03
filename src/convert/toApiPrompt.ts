import { type WidgetSpec, widgetSpecs } from '../comfy/objectInfo.js';
import {
  type ApiNode,
  type ApiPrompt,
  type ObjectInfo,
  type UiLink,
  type UiLinkTuple,
  type UiNode,
  type UiSubgraph,
  type UiWorkflow,
} from '../comfy/types.js';

/**
 * UI-format workflow -> API-format prompt, the conversion ComfyUI's frontend
 * does in `graphToPrompt()`: subgraphs are flattened (inner ids become
 * `<instance>:<inner>`), frontend-only nodes are resolved away, muted nodes are
 * dropped and bypassed ones pass their input through.
 */

export class ConvertError extends Error {}

/** Values to use instead of the saved ones, keyed `<nodePath>.<widget>`. */
export type Overrides = ReadonlyMap<string, unknown>;

const SUBGRAPH_INPUT = -10;
const SUBGRAPH_OUTPUT = -20;
const MUTED = 2;
const BYPASSED = 4;
const CONTROL_MODES = new Set(['fixed', 'increment', 'decrement', 'randomize']);

/** Nodes that exist only in the frontend and never reach the server. */
const VIRTUAL = new Set([
  'Note',
  'MarkdownNote',
  'Reroute',
  'PrimitiveNode',
  'SetNode',
  'GetNode',
]);

type Source = { node: string; slot: number } | { value: unknown } | null;

interface Level {
  nodes: Map<string, UiNode>;
  links: Map<number, UiLink>;
  prefix: string;
  parent?: { level: Level; instance: UiNode };
}

function normalizeLink(l: UiLinkTuple | UiLink): UiLink {
  if (!Array.isArray(l)) return l;
  const [id, origin_id, origin_slot, target_id, target_slot, type] = l;
  return { id, origin_id, origin_slot, target_id, target_slot, type };
}

class Converter {
  private readonly subgraphs: Map<string, UiSubgraph>;
  private readonly root: Level;
  readonly prompt: ApiPrompt = {};
  /** Control modes saved after seed-like values, keyed `<nodePath>.<widget>`. */
  readonly controls = new Map<string, string>();

  constructor(
    workflow: UiWorkflow,
    private readonly info: ObjectInfo,
    private readonly overrides: Overrides,
  ) {
    this.subgraphs = new Map(
      (workflow.definitions?.subgraphs ?? []).map((s) => [s.id, s]),
    );
    this.root = this.level(workflow.nodes, workflow.links, '');
  }

  private level(
    nodes: UiNode[],
    links: (UiLinkTuple | UiLink)[],
    prefix: string,
    parent?: Level['parent'],
  ): Level {
    return {
      nodes: new Map(nodes.map((n) => [String(n.id), n])),
      links: new Map(links.map((l) => [normalizeLink(l).id, normalizeLink(l)])),
      prefix,
      parent,
    };
  }

  private childLevel(level: Level, instance: UiNode): Level {
    const def = this.subgraphs.get(instance.type);
    if (!def)
      throw new ConvertError(`subgraph ${instance.type} is not defined`);
    return this.level(def.nodes, def.links, `${level.prefix}${instance.id}:`, {
      level,
      instance,
    });
  }

  private label(level: Level, node: UiNode): string {
    return `"${node.title ?? node.type}" (#${level.prefix}${node.id})`;
  }

  /** The node's widget values by name, with overrides applied. */
  widgetValues(level: Level, node: UiNode): Map<string, unknown> {
    const path = `${level.prefix}${node.id}`;
    const values = new Map<string, unknown>();
    const wv = node.widgets_values;
    if (wv && !Array.isArray(wv)) {
      for (const [k, v] of Object.entries(wv)) values.set(k, v);
    } else if (wv) {
      const specs = widgetSpecs(this.info, node.type);
      if (specs.length) {
        let i = 0;
        const take = (spec: WidgetSpec, name: string): void => {
          if (i >= wv.length) {
            // Saved before the node grew this widget: the frontend uses the default.
            if (spec.default !== undefined) values.set(name, spec.default);
            return;
          }
          const value = wv[i++];
          values.set(name, value);
          const next = wv[i];
          if (
            spec.control &&
            typeof next === 'string' &&
            CONTROL_MODES.has(next)
          ) {
            this.controls.set(`${path}.${name}`, next);
            i++;
          }
          for (const sub of spec.dynamic?.[String(value)] ?? []) {
            take(sub, `${name}.${sub.name}`);
          }
        };
        for (const spec of specs) take(spec, spec.name);
      } else {
        // Not a server node (subgraph instance, PrimitiveNode): its widgets
        // are listed as inputs.
        const names = (node.inputs ?? [])
          .filter((input) => input.widget)
          .map((input) => input.widget?.name ?? input.name);
        names.forEach((name, i) => {
          if (i < wv.length) values.set(name, wv[i]);
        });
      }
    }
    // Node paths never contain a dot; widget names can (`format.bit_depth`).
    for (const [key, value] of this.overrides) {
      const at = key.indexOf('.');
      if (at > 0 && key.slice(0, at) === path) {
        values.set(key.slice(at + 1), value);
      }
    }
    return values;
  }

  private resolveLink(level: Level, linkId: number | null | undefined): Source {
    if (linkId === null || linkId === undefined) return null;
    const link = level.links.get(linkId);
    if (!link) return null;
    return this.resolveOutput(level, link.origin_id, link.origin_slot);
  }

  private resolveOutput(level: Level, originId: number, slot: number): Source {
    if (originId === SUBGRAPH_INPUT) {
      const parent = level.parent;
      if (!parent) return null;
      const input = parent.instance.inputs?.[slot];
      if (!input) return null;
      if (input.link !== null && input.link !== undefined) {
        return this.resolveLink(parent.level, input.link);
      }
      const promoted = this.widgetValues(parent.level, parent.instance);
      return promoted.has(input.name)
        ? { value: promoted.get(input.name) }
        : null;
    }

    const node = level.nodes.get(String(originId));
    if (!node || node.mode === MUTED) return null;
    if (node.mode === BYPASSED) return this.bypass(level, node, slot);

    if (this.subgraphs.has(node.type)) {
      const inner = this.childLevel(level, node);
      const out = [...inner.links.values()].find(
        (l) => l.target_id === SUBGRAPH_OUTPUT && l.target_slot === slot,
      );
      return out
        ? this.resolveOutput(inner, out.origin_id, out.origin_slot)
        : null;
    }

    switch (node.type) {
      case 'Reroute':
        return this.resolveLink(level, node.inputs?.[0]?.link);
      case 'PrimitiveNode': {
        const values = this.widgetValues(level, node);
        const first = [...values.values()][0];
        const wv = node.widgets_values;
        return {
          value: Array.isArray(wv) && values.size === 0 ? wv[0] : first,
        };
      }
      case 'GetNode':
        return this.resolveGet(level, node);
      case 'SetNode':
        return this.resolveLink(level, node.inputs?.[0]?.link);
    }

    return { node: `${level.prefix}${node.id}`, slot };
  }

  private bypass(level: Level, node: UiNode, slot: number): Source {
    const type = node.outputs?.[slot]?.type;
    const input = (node.inputs ?? []).find(
      (i) =>
        i.link !== null &&
        i.link !== undefined &&
        (i.type === type || i.type === '*' || type === '*'),
    );
    return input ? this.resolveLink(level, input.link) : null;
  }

  /** KJNodes Get/Set: a GetNode reads the SetNode with the same name. */
  private resolveGet(level: Level, get: UiNode): Source {
    const name = Array.isArray(get.widgets_values)
      ? get.widgets_values[0]
      : undefined;
    for (let l: Level | undefined = level; l; l = l.parent?.level) {
      for (const n of l.nodes.values()) {
        if (
          n.type === 'SetNode' &&
          Array.isArray(n.widgets_values) &&
          n.widgets_values[0] === name
        ) {
          return this.resolveLink(l, n.inputs?.[0]?.link);
        }
      }
    }
    throw new ConvertError(
      `${this.label(level, get)}: no SetNode named "${String(name)}"`,
    );
  }

  /** The UI node at `path` (`"105"`, `"104:99"`) and the level it lives in. */
  find(path: string): { level: Level; node: UiNode } | undefined {
    let level = this.root;
    const parts = path.split(':');
    for (const [i, id] of parts.entries()) {
      const node = level.nodes.get(id);
      if (!node) return undefined;
      if (i === parts.length - 1) return { level, node };
      level = this.childLevel(level, node);
    }
    return undefined;
  }

  emit(level: Level = this.root): void {
    for (const node of level.nodes.values()) {
      if (node.mode === MUTED || node.mode === BYPASSED) continue;
      if (this.subgraphs.has(node.type)) {
        this.emit(this.childLevel(level, node));
        continue;
      }
      if (VIRTUAL.has(node.type)) continue;
      if (!this.info[node.type]) {
        throw new ConvertError(
          `${this.label(level, node)}: node type "${node.type}" is not installed in ComfyUI`,
        );
      }
      this.prompt[`${level.prefix}${node.id}`] = this.apiNode(level, node);
    }
  }

  private apiNode(level: Level, node: UiNode): ApiNode {
    const def = this.info[node.type];
    const known = new Set([
      ...Object.keys(def?.input.required ?? {}),
      ...Object.keys(def?.input.optional ?? {}),
    ]);
    const inputs: Record<string, unknown> = {};
    const values = this.widgetValues(level, node);

    if (node.type === 'CustomCombo') {
      Object.assign(inputs, customCombo(node, values));
    } else if (node.type === RGTHREE_LORA) {
      Object.assign(inputs, rgthreeLoras(node));
    } else {
      for (const [name, value] of values) {
        if (known.has(name) || name.includes('.')) inputs[name] = value;
      }
    }

    for (const input of node.inputs ?? []) {
      if (input.link === null || input.link === undefined) continue;
      const source = this.resolveLink(level, input.link);
      const name = input.widget?.name ?? input.name;
      if (!source) continue;
      inputs[name] =
        'value' in source ? source.value : [source.node, source.slot];
    }

    return {
      class_type: node.type,
      inputs,
      _meta: { title: node.title ?? def?.display_name ?? node.type },
    };
  }
}

const RGTHREE_LORA = 'Power Lora Loader (rgthree)';

/**
 * rgthree's Power Lora Loader adds its widgets in the frontend: a header, one
 * `lora_<n>` per row and the "add" button, all sent to the server by name.
 */
function rgthreeLoras(node: UiNode): Record<string, unknown> {
  const wv = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const value of wv) {
    if (value && typeof value === 'object' && 'lora' in value) {
      // Unset fields (strengthTwo when clip strength is not split) are dropped.
      out[`lora_${++n}`] = Object.fromEntries(
        Object.entries(value).filter(([, v]) => v !== null),
      );
    } else if (value && typeof value === 'object' && 'type' in value) {
      out[String(value.type)] = value;
    } else if (value === '') {
      out['➕ Add Lora'] = value;
    }
  }
  return out;
}

/** CustomCombo keeps its options in the widget values after the choice. */
function customCombo(
  node: UiNode,
  values: Map<string, unknown>,
): Record<string, unknown> {
  const wv = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  const options = wv.slice(2).map(String);
  const choice = values.get('choice') ?? wv[0];
  const out: Record<string, unknown> = {
    choice,
    index: Math.max(0, options.indexOf(String(choice))),
  };
  options.forEach((o, i) => (out[`option${i + 1}`] = o));
  return out;
}

export interface SavedNode {
  node: UiNode;
  values: Map<string, unknown>;
  controls: Map<string, string>;
}

/** A node's saved widget values, as the conversion reads them. */
export function savedNode(
  workflow: UiWorkflow,
  info: ObjectInfo,
  path: string,
): SavedNode | undefined {
  const converter = new Converter(workflow, info, new Map());
  const found = converter.find(path);
  if (!found) return undefined;
  const values = converter.widgetValues(found.level, found.node);
  const controls = new Map<string, string>();
  for (const [key, mode] of converter.controls) {
    if (key.startsWith(`${path}.`))
      controls.set(key.slice(path.length + 1), mode);
  }
  return { node: found.node, values, controls };
}

export function toApiPrompt(
  workflow: UiWorkflow,
  info: ObjectInfo,
  overrides: Overrides = new Map(),
): ApiPrompt {
  const converter = new Converter(workflow, info, overrides);
  converter.emit();
  return converter.prompt;
}
