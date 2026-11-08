/**
 * pi extension: two plain tools over ComfyUI App Mode workflows that produce
 * images - `comfy_workflow_inputs` lists them with their parameters, and
 * `comfy_generate` runs one and saves the images into the current project -
 * or, in simple mode, one `generate_image` tool over two configured workflows.
 * Commands: `/comfy-install-workflows` and `/comfy-simple`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { describeInputs, summaryLine } from './appInputs.js';
import {
  buildCatalog,
  type Catalog,
  catalogEntry,
  type CatalogEntry,
  readCache,
  writeCache,
} from './catalog.js';
import { ComfyClient } from './comfy/client.js';
import {
  CACHE_FILE,
  type Config,
  CONFIG_FILE,
  loadConfig,
  saveSimple,
  type SimpleMode,
} from './config.js';
import { FailureGuard } from './guard.js';
import { INSTALL_DIR, installWorkflows } from './install.js';
import { type InputBlock, ParamsError } from './params.js';
import { runWorkflow } from './runner.js';
import { saveImages } from './save.js';

const LOG = '[wr-comfy-image]';

/** Where generated images go, relative to the session's working directory. */
export const IMAGES_DIR = path.join('.pi', 'images');

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

interface GenerateParams {
  workflow: string;
  prompt?: string;
  images?: string[];
  params?: Record<string, string | number | boolean>;
}

interface GenerateDetails {
  files: string[];
  seeds: Record<string, number>;
  seconds: number;
}

interface GenerateResult {
  content: { type: 'text'; text: string }[];
  details: GenerateDetails;
}

type UpdateCallback = (update: GenerateResult) => void;

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function stamp(date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** Reads an input image the agent named by path (relative to the project). */
function readImage(cwd: string, file: string): InputBlock {
  const full = path.resolve(cwd, file);
  const ext = path.extname(full).slice(1).toLowerCase();
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) throw new Error(`${file}: not a png, jpg, webp or gif image`);
  try {
    return {
      type: 'image',
      data: readFileSync(full).toString('base64'),
      mimeType,
    };
  } catch (err) {
    throw new Error(`${file}: ${message(err)}`, { cause: err });
  }
}

export default async function comfyImage(pi: ExtensionAPI): Promise<void> {
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`${LOG} ${message(err)} - tools not registered`);
    return;
  }
  const client = new ComfyClient(config.url);
  let catalog: Catalog | undefined;
  let entries = readCache(CACHE_FILE);
  /** The workflow list the registered tool descriptions were built from. */
  let described: string | undefined;

  const refresh = async (): Promise<CatalogEntry[]> => {
    catalog = await buildCatalog(client, config);
    entries = catalog.entries;
    writeCache(CACHE_FILE, entries);
    if (described !== undefined && described !== summaries()) registerTools();
    return entries;
  };

  try {
    await refresh();
  } catch (err) {
    console.warn(
      `${LOG} ${message(err)}; ${entries.length} workflows from the cache`,
    );
  }

  const ids = (): string => entries.map((e) => e.id).join(', ') || 'none yet';
  const summaries = (): string =>
    entries
      .map((e) =>
        summaryLine(
          e.id,
          e.inputs,
          e.inputs.find((i) => i.key === e.prompt),
          e.missing,
        ),
      )
      .join('\n') || 'none yet';

  pi.registerCommand('comfy-install-workflows', {
    description: `Copy the bundled minimal workflows (Qwen-Image 2.1; FLUX.2 klein, deprecated) into ComfyUI workflows/${INSTALL_DIR}/ (never overwrites) and list missing model files`,
    handler: async (_args, ctx) => {
      try {
        const info = catalog?.info ?? (await client.objectInfo());
        const result = await installWorkflows(client, info);
        await refresh();
        const lines = [
          result.installed.length
            ? `Installed: ${result.installed.join(', ')}`
            : '',
          result.kept.length
            ? `Already there, left as they are: ${result.kept.join(', ')}`
            : '',
          ...result.missing.map(
            (m) =>
              `Missing model: ${m.name} -> ComfyUI/models/${m.directory}/ (${m.url})`,
          ),
        ];
        ctx.ui.notify(
          lines.filter(Boolean).join('\n'),
          result.missing.length ? 'warning' : 'info',
        );
      } catch (err) {
        ctx.ui.notify(message(err), 'error');
      }
    },
  });

  const failures = new FailureGuard();

  const noSuchWorkflow = (name: string): string => {
    const close = entries.filter((e) => e.id.endsWith(`/${name}`));
    return close.length === 1
      ? `No ComfyUI workflow "${name}". Did you mean "${close[0]?.id}"? Use the full name.`
      : `No ComfyUI workflow "${name}". Use one of these names exactly: ${ids()}`;
  };

  const runGeneration = async (
    params: GenerateParams,
    signal: AbortSignal | undefined,
    onUpdate: UpdateCallback | undefined,
    cwd: string,
  ): Promise<GenerateResult> => {
    // A workflow added after startup is not in the catalog yet.
    if (!catalog || !entries.some((e) => e.id === params.workflow)) {
      await refresh();
    }
    const current = catalog;
    const cached = entries.find((e) => e.id === params.workflow);
    if (!current || !cached)
      throw new ParamsError(noSuchWorkflow(params.workflow));
    // The workflow may have been edited in ComfyUI since the catalog was read.
    const workflow = await client.readWorkflow(cached.file);
    const entry = catalogEntry(
      cached.file,
      cached.modified,
      workflow,
      current.info,
      config,
    );

    const input: InputBlock[] = [];
    if (params.prompt) input.push({ type: 'text', text: params.prompt });
    if (params.params && Object.keys(params.params).length) {
      input.push({ type: 'text', text: JSON.stringify(params.params) });
    }
    for (const file of params.images ?? []) input.push(readImage(cwd, file));

    const result = await runWorkflow(
      client,
      entry,
      workflow,
      current.info,
      input,
      {
        timeoutMs: config.timeoutMs,
        signal,
        onProgress: (seconds) =>
          onUpdate?.({
            content: [{ type: 'text', text: `Generating... ${seconds} s` }],
            details: { files: [], seeds: {}, seconds },
          }),
      },
    );

    const saved = saveImages(
      path.join(cwd, IMAGES_DIR),
      `${params.workflow.replaceAll('/', '_')}-${stamp()}`,
      result.images,
    );
    const seeds = Object.values(result.seeds);
    const summary = [
      `Saved ${saved.length} image(s):`,
      ...saved.map((f) => `- ${f}`),
      seeds.length ? `seed: ${seeds.join(', ')}` : '',
      `${result.seconds} s`,
      'Read a file to look at it.',
    ]
      .filter(Boolean)
      .join('\n');
    // Paths only: an image in the result costs tokens on every later turn,
    // and the model can read the file when it needs to look.
    return {
      content: [{ type: 'text', text: summary }],
      details: { files: saved, seeds: result.seeds, seconds: result.seconds },
    };
  };

  const generate = async (
    params: GenerateParams,
    signal: AbortSignal | undefined,
    onUpdate: UpdateCallback | undefined,
    cwd: string,
  ): Promise<GenerateResult> => {
    failures.check(params.workflow);
    try {
      const result = await runGeneration(params, signal, onUpdate, cwd);
      failures.succeed(params.workflow);
      return result;
    } catch (err) {
      // A wrong param is answered with its fix; only real failures count.
      if (err instanceof ParamsError || signal?.aborted) throw err;
      failures.fail(params.workflow, message(err));
      throw new Error(
        `${message(err)}\nDo not change other params to get around this. If it fails again, tell the user.`,
        { cause: err },
      );
    }
  };

  const registerFullTools = (): void => {
    described = summaries();
    pi.registerTool({
      name: 'comfy_workflow_inputs',
      label: 'ComfyUI workflows',
      promptSnippet: 'List ComfyUI image workflows and their params',
      description:
        'Lists the ComfyUI image workflows and the params each one accepts (name: type or choices (= default, or random each run)). ' +
        'Call it before comfy_generate to see the param names. ' +
        `Workflows: ${ids()}.`,
      parameters: Type.Object({
        workflow: Type.Optional(
          Type.String({ description: 'Workflow name; omit to list all' }),
        ),
        verbose: Type.Optional(
          Type.Boolean({
            description: 'Also show node titles, full keys and every choice',
          }),
        ),
      }),
      async execute(
        _toolCallId,
        params: { workflow?: string; verbose?: boolean },
      ) {
        try {
          await refresh();
        } catch {
          // Offline: describe what the cache knows.
        }
        const list = params.workflow
          ? entries.filter((e) => e.id === params.workflow)
          : entries;
        const text = list.length
          ? list
              .map((e) =>
                describeInputs(
                  e.id,
                  e.inputs,
                  e.inputs.find((i) => i.key === e.prompt),
                  params.verbose,
                  e,
                ),
              )
              .join('\n\n')
          : `No ComfyUI workflow${params.workflow ? ` "${params.workflow}"` : 's'}. ` +
            `Available: ${ids()}. They come from ComfyUI App Mode (${config.url}); settings: ${CONFIG_FILE}`;
        return {
          content: [{ type: 'text', text }],
          details: { count: list.length },
        };
      },
    });

    pi.registerTool({
      name: 'comfy_generate',
      label: 'ComfyUI generate',
      promptSnippet: 'Generate or edit images with a ComfyUI workflow',
      promptGuidelines: [
        'Call comfy_workflow_inputs before comfy_generate when the param names of a workflow are not known yet.',
        'After comfy_generate, use read on a saved file only when you need to look at the image.',
      ],
      // ComfyUI runs one job at a time; concurrent calls would spend their timeout in its queue.
      executionMode: 'sequential',
      description:
        'Generates images with a ComfyUI workflow, saves them in the project under .pi/images/ and returns their paths. ' +
        'Example: {"workflow":"<name>","prompt":"a red fox in snow, watercolor","params":{"seed":42}}. ' +
        'Param names are exactly as listed below; unset params keep the workflow defaults; ' +
        'a wrong value is answered with the allowed ones. For image-to-image pass input files in "images". ' +
        'comfy_workflow_inputs shows choices, ranges and defaults.\n' +
        `Workflows:\n${summaries()}`,
      parameters: Type.Object({
        workflow: Type.String({ description: 'Workflow name' }),
        prompt: Type.Optional(
          Type.String({
            description: 'What to generate, or the edit instruction',
          }),
        ),
        images: Type.Optional(
          Type.Array(Type.String(), {
            description:
              'Input image files (paths relative to the project; png, jpg, webp or gif), in the order the workflow takes them',
          }),
        ),
        params: Type.Optional(
          Type.Record(
            Type.String(),
            Type.Union([Type.String(), Type.Number(), Type.Boolean()]),
            {
              description:
                'Workflow params by name, e.g. {"seed": 42, "steps": 8}',
            },
          ),
        ),
      }),
      execute: (_toolCallId, params: GenerateParams, signal, onUpdate, ctx) =>
        generate(params, signal, onUpdate, ctx.cwd),
    });
  };

  const registerSimpleTool = (simple: SimpleMode): void => {
    described = summaries();
    pi.registerTool({
      name: 'generate_image',
      label: 'Generate image',
      promptSnippet: 'Generate an image, or edit an image file',
      promptGuidelines: [
        'Use generate_image once per requested image; use read on a saved file only when you need to look at it.',
      ],
      executionMode: 'sequential',
      description:
        'Generates an image and returns the path of the saved file. ' +
        'To create: {"prompt":"a red fox in snow, watercolor"}. ' +
        'To edit: {"prompt":"make it winter","image":"photo.png"}, where prompt says only what to change.',
      parameters: Type.Object({
        prompt: Type.String({
          description: 'What to generate, or the edit instruction',
        }),
        image: Type.Optional(
          Type.String({ description: 'Image file to edit; omit to create' }),
        ),
      }),
      execute: (
        _toolCallId,
        params: { prompt: string; image?: string },
        signal,
        onUpdate,
        ctx,
      ) => {
        const workflow = params.image ? simple.edit : simple.text;
        if (!workflow) {
          throw new Error(
            `Stop. Tell the user: no workflow is set for ${params.image ? 'editing' : 'creating'} images; run /comfy-simple.`,
          );
        }
        return generate(
          {
            workflow,
            prompt: params.prompt,
            images: params.image ? [params.image] : [],
          },
          signal,
          onUpdate,
          ctx.cwd,
        );
      },
    });
  };

  pi.registerCommand('comfy-simple', {
    description:
      'Give the agent one simple image tool: pick a workflow for creating and one for editing. "/comfy-simple off" brings the full tools back',
    handler: async (args, ctx) => {
      try {
        if (args.trim() === 'off') {
          saveSimple(undefined);
          ctx.ui.notify('Simple mode off. Run /reload to apply.', 'info');
          return;
        }
        await refresh();
        const none = '(none)';
        const names = [
          none,
          ...entries.filter((e) => !e.missing).map((e) => e.id),
        ];
        const pick = async (title: string): Promise<string | undefined> => {
          const choice = await ctx.ui.select(title, names);
          return choice === none ? undefined : choice;
        };
        const text = await pick('Workflow for creating images');
        const edit = await pick('Workflow for editing images');
        if (!text && !edit) {
          ctx.ui.notify('Nothing picked, nothing changed.', 'info');
          return;
        }
        saveSimple({
          ...(text ? { text } : {}),
          ...(edit ? { edit } : {}),
        });
        ctx.ui.notify('Simple mode on. Run /reload to apply.', 'info');
      } catch (err) {
        ctx.ui.notify(message(err), 'error');
      }
    },
  });

  const { simple } = config;
  const registerTools = simple
    ? (): void => registerSimpleTool(simple)
    : registerFullTools;
  registerTools();
}
