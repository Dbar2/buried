/**
 * Date wording for land-use areas (session 034). An area is not built: "Built by 1914. Last seen 1911"
 * says nothing a reader can use about a use lettered on a plan. The same windows give other words:
 *
 *  - "Lettered on the 1911 plan" for the earliest clear presence;
 *  - "Still lettered on the 1931-35 plan" for each later clear presence;
 *  - "Not lettered on the 1931-35 plan" only for a clear absence (before or after the presences).
 *
 * Obscured and not-covered sources are never worded here: they are not in `presences`,
 * `beforeAbsences` or `afterAbsences`. A photograph is not lettered, so for a source that is not a
 * plan the verb is "shown" ("Still shown on the 1947 photograph"). Source names are the plain names
 * ("the 1911 plan"), never ids. Pure.
 */
import type { Dated, ObservationRef } from './dates';
import { plainSourceName } from './plainWords';
import type { SourceIndex } from './sources';

function nameOf(ref: ObservationRef, sources: SourceIndex): { name: string; plan: boolean } {
  const source = sources.get(ref.source);
  if (!source) throw new RangeError(`source ${ref.source} is not registered`);
  return { name: plainSourceName(source), plan: source.type !== 'aerial_photograph' };
}

/** Phrases for an area, oldest source first. Each plain source name appears once per kind of phrase. */
export function areaPhrases(summary: Dated, sources: SourceIndex): string[] {
  const phrases: string[] = [];
  const seen = new Set<string>();
  const once = (key: string, text: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    phrases.push(text);
  };

  for (const ref of summary.beforeAbsences) {
    const { name, plan } = nameOf(ref, sources);
    once(`absent|${name}`, `Not ${plan ? 'lettered' : 'shown'} on ${name}`);
  }
  summary.presences.forEach((ref, i) => {
    const { name, plan } = nameOf(ref, sources);
    const verb = plan ? 'lettered' : 'shown';
    once(`present|${name}`, i === 0 ? `${plan ? 'Lettered' : 'Shown'} on ${name}` : `Still ${verb} on ${name}`);
  });
  for (const ref of summary.afterAbsences) {
    const { name, plan } = nameOf(ref, sources);
    once(`absent|${name}`, `Not ${plan ? 'lettered' : 'shown'} on ${name}`);
  }
  return phrases;
}
