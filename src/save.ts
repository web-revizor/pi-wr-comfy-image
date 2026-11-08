import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function writeNew(
  dir: string,
  stem: string,
  ext: string,
  data: Buffer,
): string {
  for (let attempt = 1; ; attempt++) {
    const name = attempt === 1 ? stem : `${stem}_${attempt}`;
    const file = path.join(dir, `${name}.${ext}`);
    try {
      writeFileSync(file, data, { flag: 'wx' });
      return file;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
}

/** Writes the images as `<base>.<ext>`, numbered when several; never overwrites. */
export function saveImages(
  dir: string,
  base: string,
  images: { data: string; mimeType: string }[],
): string[] {
  mkdirSync(dir, { recursive: true });
  return images.map((img, n) => {
    const ext = img.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
    const stem = images.length > 1 ? `${base}-${n + 1}` : base;
    return writeNew(dir, stem, ext, Buffer.from(img.data, 'base64'));
  });
}
