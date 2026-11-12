import type { SourceIndex } from '../evidence';

/**
 * The attribution line of each source whose raster is on screen (spec 03 requirement 21.2), as DOM
 * text. Duplicate lines are shown once.
 */
export function attributionLines(sourceIds: readonly string[], sources: SourceIndex): string[] {
  const lines = new Set<string>();
  for (const id of sourceIds) {
    const source = sources.get(id);
    if (source && source.attribution_status === 'confirmed') lines.add(source.attribution_line);
  }
  return [...lines].sort();
}

export function Attribution({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="attribution" data-testid="attribution">
      {lines.map((line) => (
        <p key={line} style={{ margin: 0 }}>
          {line}
        </p>
      ))}
    </div>
  );
}
