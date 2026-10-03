import { type ObjectInfo, type UiWorkflow } from '../comfy/types.js';

/** A small slice of `/object_info`, enough for the synthetic workflows below. */
export const info: ObjectInfo = {
  KSampler: {
    input: {
      required: {
        model: ['MODEL'],
        seed: [
          'INT',
          {
            default: 0,
            min: 0,
            max: 1125899906842624,
            control_after_generate: true,
          },
        ],
        steps: ['INT', { default: 20, min: 1, max: 100 }],
        cfg: ['FLOAT', { default: 8, min: 0, max: 100 }],
        sampler_name: [['euler', 'dpmpp_2m']],
        positive: ['CONDITIONING'],
        latent_image: ['LATENT'],
      },
    },
    input_order: {
      required: [
        'model',
        'seed',
        'steps',
        'cfg',
        'sampler_name',
        'positive',
        'latent_image',
      ],
    },
    output: ['LATENT'],
    output_node: false,
  },
  CheckpointLoaderSimple: {
    input: { required: { ckpt_name: [['a.safetensors', 'b.safetensors']] } },
    output: ['MODEL', 'CLIP', 'VAE'],
    output_node: false,
  },
  CLIPTextEncode: {
    input: {
      required: { text: ['STRING', { multiline: true }], clip: ['CLIP'] },
    },
    input_order: { required: ['text', 'clip'] },
    output: ['CONDITIONING'],
    output_node: false,
  },
  EmptyLatentImage: {
    input: {
      required: {
        width: ['INT', { default: 512, min: 16, max: 8192 }],
        height: ['INT', { default: 512, min: 16, max: 8192 }],
        batch_size: ['INT', { default: 1, min: 1, max: 64 }],
      },
    },
    output: ['LATENT'],
    output_node: false,
  },
  LoadImage: {
    input: { required: { image: [['in.png'], { image_upload: true }] } },
    output: ['IMAGE', 'MASK'],
    output_node: false,
  },
  ImageInvert: {
    input: { required: { image: ['IMAGE'] } },
    output: ['IMAGE'],
    output_node: false,
  },
  SaveImage: {
    input: {
      required: {
        images: ['IMAGE'],
        filename_prefix: ['STRING', { default: 'ComfyUI' }],
      },
    },
    output: [],
    output_node: true,
  },
  SaveVideo: {
    input: {
      required: {
        video: ['VIDEO'],
        filename_prefix: ['STRING', { default: 'video' }],
      },
    },
    output: [],
    output_node: true,
  },
};

/** Checkpoint -> prompt -> KSampler -> SaveImage, App Mode exposing prompt, seed, cfg. */
export function txt2img(): UiWorkflow {
  return {
    nodes: [
      {
        id: 1,
        type: 'CheckpointLoaderSimple',
        widgets_values: ['a.safetensors'],
      },
      {
        id: 2,
        type: 'CLIPTextEncode',
        title: 'Prompt',
        inputs: [{ name: 'clip', type: 'CLIP', link: 1 }],
        widgets_values: ['a cat'],
      },
      { id: 3, type: 'EmptyLatentImage', widgets_values: [512, 512, 1] },
      {
        id: 4,
        type: 'KSampler',
        title: 'Sampler',
        inputs: [
          { name: 'model', type: 'MODEL', link: 2 },
          { name: 'positive', type: 'CONDITIONING', link: 3 },
          { name: 'latent_image', type: 'LATENT', link: 4 },
        ],
        widgets_values: [42, 'randomize', 20, 7, 'euler'],
      },
      {
        id: 5,
        type: 'SaveImage',
        inputs: [{ name: 'images', type: 'IMAGE', link: 5 }],
        widgets_values: ['out'],
      },
      { id: 6, type: 'Note', widgets_values: ['notes'] },
    ],
    links: [
      [1, 1, 1, 2, 0, 'CLIP'],
      [2, 1, 0, 4, 0, 'MODEL'],
      [3, 2, 0, 4, 1, 'CONDITIONING'],
      [4, 3, 0, 4, 2, 'LATENT'],
      [5, 4, 0, 5, 0, 'IMAGE'],
    ],
    extra: {
      linearMode: true,
      linearData: {
        inputs: [
          ['2', 'text'],
          ['4', 'seed'],
          ['4', 'cfg'],
          ['4', 'sampler_name'],
        ],
        outputs: ['5'],
      },
    },
  };
}
