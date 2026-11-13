import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ServiceError, ServiceUnavailableError, createServiceClient } from './client';
import type { DecisionsV2, Source } from './types.generated';

const FIXTURES = fileURLToPath(new URL('../../../../data/schema/studio_api_fixtures/valid/', import.meta.url));
const fixture = (path: string): unknown => JSON.parse(readFileSync(`${FIXTURES}${path}`, 'utf8'));

const DATA_VERSION = 'a'.repeat(64);
const PLATE_REF = 'b'.repeat(64);

type Call = { url: string; init: RequestInit };

function fakeFetch(responder: (url: string) => { status?: number; body: unknown } | Error) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const answer = responder(url);
    if (answer instanceof Error) throw answer;
    return {
      ok: (answer.status ?? 200) < 400,
      status: answer.status ?? 200,
      json: async () => answer.body,
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const client = (impl: typeof fetch) => createServiceClient({ fetchImpl: impl, dataVersion: async () => DATA_VERSION });

const source = ((fixture('registeredPlatesResponse/one_plate_with_tile.json') as { plates: Array<{ source: Source }> }).plates[0] as { source: Source }).source;
const decisions = fixture('decisionsV2/every_type.json') as DecisionsV2;

describe('the Studio client', () => {
  it('reads the health answer', async () => {
    const { impl } = fakeFetch(() => ({ body: fixture('healthResponse/label_provider_none.json') }));
    const health = await client(impl).health();
    expect(health.api_version).toBe('1.0.0');
  });

  it('says the Service is unavailable when the network fails', async () => {
    const { impl } = fakeFetch(() => new Error('connection refused'));
    await expect(client(impl).health()).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('says the Service is unavailable for an answer that is not this Service', async () => {
    const { impl } = fakeFetch(() => ({ body: { hello: 'world' } }));
    await expect(client(impl).health()).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('says the Service is unavailable for an error status without an error body', async () => {
    const { impl } = fakeFetch(() => ({ status: 502, body: '<html>Bad gateway</html>' }));
    await expect(client(impl).health()).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('passes on an error body as a ServiceError with its code', async () => {
    const { impl } = fakeFetch(() => ({ status: 422, body: fixture('errorBody/validation_failed.json') }));
    const error = await client(impl).extract({ plateRef: PLATE_REF, source, region: { x: 0, y: 0, width: 10, height: 10 } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).code).toBe('validation_failed');
  });

  it('sends api_version and the data version with an extract request', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: fixture('extractResponse/counts.json') }));
    await client(impl).extract({ plateRef: PLATE_REF, source, region: { x: 0, y: 0, width: 10, height: 10 } }).catch(() => undefined);
    const sent = JSON.parse(calls[0]?.init.body as string) as Record<string, unknown>;
    expect(sent.api_version).toBe('1.0.0');
    expect(sent.data_version).toBe(DATA_VERSION);
    expect(calls[0]?.url).toBe('/v1/extract');
  });

  it('sends api_version, the data version and an empty workspace with a publish request, and reads both answers', async () => {
    for (const name of ['ok', 'errors']) {
      const { impl, calls } = fakeFetch(() => ({ body: fixture(`publishResponse/${name}.json`) }));
      const answer = await client(impl).publish({ sourceId: source.id, proposalFileText: '{}\n', decisions, dryRun: true });
      expect(answer.ok).toBe(name === 'ok');
      const sent = JSON.parse(calls[0]?.init.body as string) as { dry_run: boolean; data_version: string; workspace: Record<string, unknown[]> };
      expect(sent.dry_run).toBe(true);
      expect(sent.data_version).toBe(DATA_VERSION);
      expect(Object.values(sent.workspace).every((list) => list.length === 0)).toBe(true);
    }
  });

  it('refuses to send a request that does not match the schema', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: {} }));
    await expect(
      client(impl).extract({ plateRef: 'not a ref', source, region: { x: 0, y: 0, width: 10, height: 10 } }),
    ).rejects.toThrow(/extractRequest/);
    expect(calls).toHaveLength(0);
  });
});
