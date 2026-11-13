/**
 * The human title of a Volume 3 plate for lists: "Plate 229, 1911 edition, revised to 1914".
 * Built from the source id (`fip_v3_<edition>_<plate>`) and the source's `years_label`; any other
 * source falls back to the registry title.
 */
export type TitledSource = { id: string; title: string; years_label?: string | undefined };

export function plateTitle(source: TitledSource): string {
  const match = /^fip_v3_(\d{4})_(\d+)$/.exec(source.id);
  if (!match) return source.title;
  const [, edition, plate] = match;
  const head = `Plate ${plate}, ${edition} edition`;
  const label = source.years_label?.trim();
  if (!label) return head;
  // "1911, revised to 1914" repeats the edition year, so keep only what it adds.
  if (label.startsWith(`${edition},`)) return `${head},${label.slice(edition!.length + 1)}`;
  return `${head} (${label})`;
}
