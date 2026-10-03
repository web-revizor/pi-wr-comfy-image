/**
 * pi extension: every ComfyUI App Mode workflow that produces images becomes an
 * image model of the `comfyui` provider, run through `models.generateImages()`,
 * plus the `comfy_workflow_inputs` tool that lists what each model accepts.
 */
import type {
  AssistantImages,
  ImageApi,
  ImageModel,
  ImagesContext,
  ImagesOptions,
} from '@earendil-works/pi-ai';
import type {
  ExtensionAPI,
  ProviderModelConfig,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { describeInputs } from './appInputs.js';
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
import { runWorkflow } from './runner.js';

const PROVIDER = 'comfyui';
const API = 'comfyui-images';
const LOG = '[wr-comfy-image]';

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toModels(entries: CatalogEntry[]): ProviderModelConfig[] {
  return entries.map((e) => ({
    type: 'image',
    id: e.id,
    name: e.id,
    api: API,
    input: e.inputs.some((i) => i.kind === 'image')
      ? ['text', 'image']
      : ['text'],
    output: ['image', 'text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }));
}

export default async function comfyImage(pi: ExtensionAPI): Promise<void> {
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`${LOG} ${message(err)} - not registered`);
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
      `${LOG} ${message(err)}; ${entries.length} models from the cache`,
    );
  }

  const generateImages = async (
    model: ImageModel<ImageApi>,
    context: ImagesContext,
    options?: ImagesOptions,
  ): Promise<AssistantImages> => {
    const base = {
      api: API,
      provider: PROVIDER,
      model: model.id,
      timestamp: Date.now(),
    };
    try {
      if (!catalog) await refresh();
      const current = catalog;
      const cached = entries.find((e) => e.id === model.id);
      if (!current || !cached)
        throw new Error(`no ComfyUI workflow "${model.id}"`);
      // The workflow may have been edited in ComfyUI since the catalog was read.
      const workflow = await client.readWorkflow(cached.file);
      const entry = catalogEntry(
        cached.file,
        cached.modified,
        workflow,
        current.info,
        config,
      );
      const result = await runWorkflow(
        client,
        entry,
        workflow,
        current.info,
        context.input,
        { timeoutMs: config.timeoutMs, signal: options?.signal },
      );
      const seeds = Object.entries(result.seeds)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      const summary = [
        `saved: ${result.images.map((i) => i.file).join(', ')}`,
        seeds && `seed: ${seeds}`,
        `${result.seconds} s, prompt ${result.promptId}`,
      ]
        .filter(Boolean)
        .join(' · ');
      return {
        ...base,
        output: [
          ...result.images.map((i) => ({
            type: 'image' as const,
            data: i.data,
            mimeType: i.mimeType,
          })),
          { type: 'text' as const, text: summary },
        ],
        stopReason: 'stop',
      };
    } catch (err) {
      return {
        ...base,
        output: [],
        stopReason: options?.signal?.aborted ? 'aborted' : 'error',
        errorMessage: message(err),
      };
    }
  };

  pi.registerProvider(PROVIDER, {
    name: 'ComfyUI',
    baseUrl: config.url,
    apiKey: 'local',
    models: toModels(entries),
    images: { [API]: { generateImages } },
    refreshModels: async () => toModels(await refresh()),
  });

  pi.registerTool({
    name: 'comfy_workflow_inputs',
    label: 'ComfyUI workflow inputs',
    description:
      'Lists the inputs of the ComfyUI image models (provider "comfyui"): the prompt input, image inputs and every ' +
      'parameter with its key, type, default and choices. Pass them to models.generateImages() as a text block ' +
      'holding a JSON object, e.g. {"118.value": 42, "aspect": "16:9"}.',
    parameters: Type.Object({
      workflow: Type.Optional(
        Type.String({
          description: 'Model id; omit to list every ComfyUI image model',
        }),
      ),
    }),
    async execute(_toolCallId, params: { workflow?: string }) {
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
              ),
            )
            .join('\n\n')
        : `No ComfyUI image workflows${params.workflow ? ` named "${params.workflow}"` : ''}. ` +
          `Workflows come from ComfyUI App Mode (${config.url}); settings: ${CONFIG_FILE}`;
      return {
        content: [{ type: 'text', text }],
        details: { count: list.length },
      };
    },
  });
}
