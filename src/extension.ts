/**
 * pi extension: two plain tools over ComfyUI App Mode workflows that produce
 * images - `comfy_workflow_inputs` lists them with their parameters, and
 * `comfy_generate` runs one and saves the images into the current project.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import { CACHE_FILE, type Config, CONFIG_FILE, loadConfig } from './config.js';
import { type InputBlock } from './params.js';
import { runWorkflow } from './runner.js';

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

  const refresh = async (): Promise<CatalogEntry[]> => {
    catalog = await buildCatalog(client, config);
    entries = catalog.entries;
    writeCache(CACHE_FILE, entries);
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
        ),
      )
      .join('\n') || 'none yet';

  pi.registerTool({
    name: 'comfy_workflow_inputs',
    label: 'ComfyUI workflows',
    description:
      'Lists the ComfyUI image workflows and the params each one accepts (name: type or choices (= default)). ' +
      'Call it before comfy_generate to see the param names. ' +
      `Workflows: ${ids()}.`,
    parameters: Type.Object({
      workflow: Type.Optional(
        Type.String({ description: 'Workflow name; omit to list all' }),
      ),
      verbose: Type.Optional(
        Type.Boolean({ description: 'Also show node titles and every choice' }),
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
    description:
      'Generates images with a ComfyUI workflow, saves them in the project under .pi/images/ and returns their paths. ' +
      'Example: {"workflow":"<name>","prompt":"a red fox in snow, watercolor","params":{"seed":42}}. ' +
      'Param names are exactly as listed below (they can be in any language); unset params keep the workflow defaults; ' +
      'a wrong value is answered with the allowed ones. For image-to-image pass input files in "images". ' +
      'comfy_workflow_inputs shows choices, ranges and defaults.\n' +
      `Workflows:\n${summaries()}`,
    parameters: Type.Object({
      workflow: Type.String({ description: 'Workflow name' }),
      prompt: Type.Optional(Type.String({ description: 'What to generate' })),
      images: Type.Optional(
        Type.Array(Type.String(), {
          description:
            'Input image files (paths), in the order the workflow takes them',
        }),
      ),
      params: Type.Optional(
        Type.Record(
          Type.String(),
          Type.Union([Type.String(), Type.Number(), Type.Boolean()]),
          {
            description:
              'Workflow params by name, e.g. {"seed": 42, "aspect": "16:9"}',
          },
        ),
      ),
    }),
    async execute(
      _toolCallId,
      params: {
        workflow: string;
        prompt?: string;
        images?: string[];
        params?: Record<string, string | number | boolean>;
      },
      signal,
      _onUpdate,
      ctx,
    ) {
      if (!catalog) await refresh();
      const current = catalog;
      const cached = entries.find((e) => e.id === params.workflow);
      if (!current || !cached) {
        throw new Error(
          `No ComfyUI workflow "${params.workflow}". Available: ${ids()}`,
        );
      }
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
      for (const file of params.images ?? [])
        input.push(readImage(ctx.cwd, file));

      const result = await runWorkflow(
        client,
        entry,
        workflow,
        current.info,
        input,
        {
          timeoutMs: config.timeoutMs,
          signal,
        },
      );

      const dir = path.join(ctx.cwd, IMAGES_DIR);
      mkdirSync(dir, { recursive: true });
      const base = `${params.workflow.replaceAll('/', '_')}-${stamp()}`;
      const saved = result.images.map((img, n) => {
        const ext = img.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
        const file = path.join(
          dir,
          `${base}${result.images.length > 1 ? `-${n + 1}` : ''}.${ext}`,
        );
        writeFileSync(file, Buffer.from(img.data, 'base64'));
        return file;
      });
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
    },
  });
}
