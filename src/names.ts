/**
 * Short parameter names from node titles, for models that do better with
 * `seed` and `long_side` than with `118.value` and `107.value`. A title is cut
 * at its first `:`, `(`, `,`, `—` or `;` and becomes lowercase snake_case in
 * whatever language it is written in - no dictionaries, no transliteration.
 */

/** Names the generate tool uses for its own arguments. */
const RESERVED = new Set(['prompt', 'images', 'workflow', 'params']);

const MAX_WORDS = 3;

/**
 * `snake_case` from a node title, or '' when nothing usable is left. `cut`
 * keeps only the part before the first `:`, `(`, `,`, `—` or `;`.
 */
export function titleSlug(
  title: string,
  maxWords = MAX_WORDS,
  cut = true,
): string {
  const numbered = title.replace(/^\s*\d+\.\s*/, ''); // "3. KSampler" numbering
  const head = cut ? (numbered.split(/[:(,—;]/)[0] ?? '') : numbered;
  const words = head
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
    .split(/[\s.-]+/)
    .filter(Boolean);
  return words.slice(0, maxWords).join('_');
}

/** Widget names that say nothing on their own. */
const GENERIC = new Set([
  'value',
  'choice',
  'string',
  'text',
  'image',
  'amount',
  'strength_model',
  'strength_clip',
  'switch',
  'boolean',
  'int',
  'float',
]);

/**
 * One unique short name per input, in order. The widget name is used when it is
 * specific and unique (`cfg`, `aspect`, `unet_name`), the title slug otherwise;
 * a clash takes more words of the title, then the node id.
 */
export function shortNames(
  inputs: { key: string; label: string; widget: string }[],
): string[] {
  const widgetCount = new Map<string, number>();
  for (const i of inputs)
    widgetCount.set(i.widget, (widgetCount.get(i.widget) ?? 0) + 1);

  const first = inputs.map((i) =>
    !GENERIC.has(i.widget) && widgetCount.get(i.widget) === 1
      ? i.widget
      : titleSlug(i.label) || i.widget,
  );
  const names = first.map((name, n) => {
    const clash = first.filter((x) => x === name).length > 1;
    if (!clash && !RESERVED.has(name)) return name;
    const longer = titleSlug(inputs[n]?.label ?? '', 4, false);
    return longer && !RESERVED.has(longer) && !first.includes(longer)
      ? longer
      : name;
  });
  return names.map((name, n) => {
    const seen = names.slice(0, n).filter((x) => x === name).length;
    const key = inputs[n]?.key ?? '';
    return seen || names.filter((x) => x === name).length > 1
      ? `${name}_${key.slice(0, key.indexOf('.')).replaceAll(':', '_')}`
      : name;
  });
}
