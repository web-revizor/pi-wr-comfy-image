/** ComfyUI workflow (UI format) and prompt (API format) shapes, as far as this package reads them. */

export interface UiLink {
  id: number;
  origin_id: number;
  origin_slot: number;
  target_id: number;
  target_slot: number;
  type: string;
}

/** Top-level links are stored as tuples: id, origin, origin slot, target, target slot, type. */
export type UiLinkTuple = [number, number, number, number, number, string];

export interface UiInput {
  name: string;
  type: string;
  link?: number | null;
  widget?: { name: string };
}

export interface UiNode {
  id: number | string;
  type: string;
  mode?: number;
  title?: string;
  inputs?: UiInput[];
  outputs?: { name: string; type: string; links?: number[] | null }[];
  widgets_values?: unknown[] | Record<string, unknown>;
}

export interface UiSubgraph {
  id: string;
  name?: string;
  nodes: UiNode[];
  links: UiLink[];
  inputs: { name: string; type: string }[];
  outputs: { name: string; type: string }[];
}

/** `[nodeId, widgetName, options?]` as App Mode stores its exposed inputs. */
export type LinearInput = [string | number, string, unknown?];

export interface UiWorkflow {
  nodes: UiNode[];
  links: (UiLinkTuple | UiLink)[];
  definitions?: { subgraphs?: UiSubgraph[] };
  extra?: {
    linearMode?: boolean;
    linearData?: { inputs?: LinearInput[]; outputs?: (string | number)[] };
  };
}

/** `[sourceNodeId, outputSlot]` or a literal value. */
export type ApiValue = unknown;

export interface ApiNode {
  class_type: string;
  inputs: Record<string, ApiValue>;
  _meta?: { title: string };
}

export type ApiPrompt = Record<string, ApiNode>;

export type InputSpec = [string | string[], Record<string, unknown>?];

export interface NodeDef {
  input: {
    required?: Record<string, InputSpec>;
    optional?: Record<string, InputSpec>;
  };
  input_order?: { required?: string[]; optional?: string[] };
  output: string[];
  output_node: boolean;
  display_name?: string;
}

export type ObjectInfo = Record<string, NodeDef>;
