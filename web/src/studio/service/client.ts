/**
 * The Studio's only caller of the Service (spec 04 design "Endpoints"). It adds `api_version` and the
 * data version to every request, times each call out, validates every response against the Service
 * API Schema, and turns failures into one of two errors:
 *
 *  - `ServiceUnavailableError`: nothing usable came back (network, timeout, or a body that is not
 *    this Service's). The Studio says so in one sentence and offers nothing that would fail.
 *  - `ServiceError`: the Service answered with an error body (its `code` and `message`).
 */
import type {
  DecisionsV2,
  ExtractResponse,
  HealthResponse,
  PixelRegion,
  ProposalFile,
  PublishResponse,
  RegisteredPlatesResponse,
  Source,
} from './types.generated';
import { API_VERSION, describeErrors, studioValidator } from './schema';

export const HEALTH_TIMEOUT_MS = 5_000;
export const EXTRACT_TIMEOUT_MS = 60_000;
export const PUBLISH_TIMEOUT_MS = 60_000;

export const UNAVAILABLE_MESSAGE =
  "The Studio service is not reachable, so extraction and publishing are off. The Explorer, the Report and the Sources page still work.";

export class ServiceUnavailableError extends Error {
  constructor(readonly detail: string) {
    super(UNAVAILABLE_MESSAGE);
    this.name = 'ServiceUnavailableError';
  }
}

export class ServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: readonly unknown[],
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export type ClientOptions = {
  /**
   * Base URL of the Service. Default: the page's own origin (the dev and preview servers proxy /v1).
   * `null` means no Service address is set: every call fails as unavailable, without a request.
   */
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
  /** The canon data version this page was built against (from /data/index.json). */
  dataVersion: () => Promise<string>;
};

export type ExtractInput = {
  plateRef: string;
  source: Source;
  region: PixelRegion;
};

export type PublishInput = {
  sourceId: string;
  proposalFileText: string;
  decisions: DecisionsV2;
  dryRun: boolean;
};

export interface ServiceClient {
  health(): Promise<HealthResponse>;
  registeredPlates(): Promise<RegisteredPlatesResponse>;
  extract(input: ExtractInput): Promise<{ response: ExtractResponse; proposals: ProposalFile }>;
  publish(input: PublishInput): Promise<PublishResponse>;
}

const EMPTY_WORKSPACE = {
  sources: [],
  control_files: [],
  alignment_records: [],
  evidence_files: [],
  tile_sidecars: [],
} as const;

export function createServiceClient(options: ClientOptions): ServiceClient {
  const base = (options.baseUrl ?? '').replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function call(path: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
    if (options.baseUrl === null) throw new ServiceUnavailableError('no Service address is set for this build (VITE_STUDIO_SERVICE_URL)');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, { ...init, signal: controller.signal });
    } catch (error) {
      const reason = controller.signal.aborted ? `no answer within ${Math.round(timeoutMs / 1000)} s` : String(error);
      throw new ServiceUnavailableError(reason);
    } finally {
      clearTimeout(timer);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ServiceUnavailableError(`HTTP ${response.status} with a body that is not JSON`);
    }
    if (!response.ok) {
      const check = studioValidator('errorBody');
      if (check(body)) {
        const { code, message, details } = (body as { error: { code: string; message: string; details: unknown[] } }).error;
        throw new ServiceError(code, message, details);
      }
      throw new ServiceUnavailableError(`HTTP ${response.status} without an error body`);
    }
    return body;
  }

  function checked<T>(def: string, body: unknown): T {
    const validate = studioValidator(def);
    if (!validate(body)) {
      throw new ServiceUnavailableError(`the answer does not match ${def}: ${describeErrors(validate.errors)}`);
    }
    return body as T;
  }

  function post(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
    return call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs);
  }

  function checkedRequest(def: string, body: unknown): void {
    const validate = studioValidator(def);
    if (!validate(body)) throw new Error(`The Studio built a ${def} that does not match the Service API Schema: ${describeErrors(validate.errors)}`);
  }

  return {
    async health() {
      return checked<HealthResponse>('healthResponse', await call('/v1/health', { method: 'GET' }, HEALTH_TIMEOUT_MS));
    },

    async registeredPlates() {
      return checked<RegisteredPlatesResponse>(
        'registeredPlatesResponse',
        await call('/v1/plates/registered', { method: 'GET' }, HEALTH_TIMEOUT_MS),
      );
    },

    async extract({ plateRef, source, region }) {
      const request = {
        api_version: API_VERSION,
        data_version: await options.dataVersion(),
        plate_ref: plateRef,
        source,
        region_px: region,
      };
      checkedRequest('extractRequest', request);
      const response = checked<ExtractResponse>('extractResponse', await post('/v1/extract', request, EXTRACT_TIMEOUT_MS));
      let proposals: unknown;
      try {
        proposals = JSON.parse(response.proposal_file_text);
      } catch {
        throw new ServiceUnavailableError('the proposal file in the answer is not JSON');
      }
      return { response, proposals: checked<ProposalFile>('proposalFile', proposals) };
    },

    async publish({ sourceId, proposalFileText, decisions, dryRun }) {
      const request = {
        api_version: API_VERSION,
        data_version: await options.dataVersion(),
        dry_run: dryRun,
        source_id: sourceId,
        workspace: EMPTY_WORKSPACE,
        proposal_file_text: proposalFileText,
        decisions,
      };
      checkedRequest('publishRequest', request);
      return checked<PublishResponse>('publishResponse', await post('/v1/publish', request, PUBLISH_TIMEOUT_MS));
    },
  };
}

/** The canon data version, from /data/index.json (written by the data plugin). */
export async function fetchDataVersion(fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<string> {
  const response = await fetchImpl('/data/index.json', { cache: 'no-cache' });
  if (!response.ok) throw new ServiceUnavailableError(`/data/index.json: HTTP ${response.status}`);
  const index = (await response.json()) as { data_version?: unknown };
  if (typeof index.data_version !== 'string') throw new ServiceUnavailableError('/data/index.json has no data_version');
  return index.data_version;
}
