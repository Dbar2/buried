/**
 * Share link and live link (spec 05 design "Links").
 *
 *   share  <origin>/report?lot=<lot id>&era=<era id>&v=<first 12 hex of the data version>
 *   live   <origin>/place?lot=<lot id>&era=<era id>
 *
 * Nothing else goes in a link, so nothing from a visitor's workspace can. Unknown parameters are
 * ignored when parsing. A lot id that cannot be decoded gives `lotId: null`, and the Report then
 * says "Not reconstructed yet.".
 */
import type { Era } from '../evidence';
import { eraOrder } from '../explorer/eraOrder';

export const VERSION_PREFIX_LENGTH = 12;

export type ParsedLink = { lotId: string | null; eraId: string | null; version: string | null };

const HEX = /^[0-9a-f]+$/;

export const versionPrefix = (dataVersion: string): string => (HEX.test(dataVersion) ? dataVersion.slice(0, VERSION_PREFIX_LENGTH) : '');

function query(lotId: string, eraId: string | null, version: string | null): string {
  const parts = [`lot=${encodeURIComponent(lotId)}`];
  if (eraId !== null) parts.push(`era=${encodeURIComponent(eraId)}`);
  if (version !== null && version !== '') parts.push(`v=${version}`);
  return parts.join('&');
}

export function shareLink(siteOrigin: string, lotId: string, eraId: string | null, dataVersion: string): string {
  return `${siteOrigin}/report?${query(lotId, eraId, versionPrefix(dataVersion))}`;
}

export function liveLink(siteOrigin: string, lotId: string, eraId: string | null): string {
  return `${siteOrigin}/place?${query(lotId, eraId, null)}`;
}

/** Parse a query string (with or without the leading "?"). */
export function parseReportLink(search: string): ParsedLink {
  const out: ParsedLink = { lotId: null, eraId: null, version: null };
  const text = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of text.split('&')) {
    const at = pair.indexOf('=');
    if (at < 0) continue;
    const name = pair.slice(0, at);
    const raw = pair.slice(at + 1);
    let value: string;
    try {
      value = decodeURIComponent(raw);
    } catch {
      if (name === 'lot') out.lotId = null;
      continue;
    }
    if (name === 'lot' && value !== '') out.lotId = value;
    else if (name === 'era' && value !== '') out.eraId = value;
    else if (name === 'v' && HEX.test(value) && value.length === VERSION_PREFIX_LENGTH) out.version = value;
  }
  return out;
}

/** The earliest era: the one deepest in the Explorer's order. */
export function earliestEraId(eras: readonly Era[]): string | null {
  const order = eraOrder(eras);
  return order.length === 0 ? null : (order[order.length - 1] as { id: string }).id;
}

/** The era a link names, or the earliest era when it is absent or unknown. */
export function resolveEra(eras: readonly Era[], eraId: string | null): string | null {
  return eraId !== null && eras.some((e) => e.id === eraId) ? eraId : earliestEraId(eras);
}
