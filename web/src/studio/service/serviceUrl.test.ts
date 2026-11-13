import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableError, UNAVAILABLE_MESSAGE, createServiceClient } from './client';
import { resolveServiceBase } from './serviceUrl';

describe('resolveServiceBase', () => {
  it('uses the address from VITE_STUDIO_SERVICE_URL, without a trailing slash', () => {
    expect(resolveServiceBase('https://buried-service.up.railway.app', false)).toBe('https://buried-service.up.railway.app');
    expect(resolveServiceBase('https://buried-service.up.railway.app/', false)).toBe('https://buried-service.up.railway.app');
    expect(resolveServiceBase(' http://127.0.0.1:8000 ', true)).toBe('http://127.0.0.1:8000');
  });

  it('reads "/" as the page\'s own origin', () => {
    expect(resolveServiceBase('/', false)).toBe('');
  });

  it('is the page\'s own origin in the dev server and no service in a production build when unset', () => {
    expect(resolveServiceBase(undefined, true)).toBe('');
    expect(resolveServiceBase('', true)).toBe('');
    expect(resolveServiceBase(undefined, false)).toBeNull();
    expect(resolveServiceBase('  ', false)).toBeNull();
  });

  it('treats a value that is not an http(s) address as unset', () => {
    for (const bad of ['javascript:alert(1)', 'ftp://x.example', 'buried-service.example.com', 'https://', 'https://a.example/?x=1', 'not a url']) {
      expect(resolveServiceBase(bad, false), bad).toBeNull();
    }
  });
});

describe('a client with no Service address', () => {
  it('says the Service is unavailable and makes no request', async () => {
    const fetchImpl = vi.fn();
    const client = createServiceClient({ baseUrl: null, fetchImpl: fetchImpl as unknown as typeof fetch, dataVersion: async () => 'x' });
    const failure = await client.health().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ServiceUnavailableError);
    expect((failure as Error).message).toBe(UNAVAILABLE_MESSAGE);
    await expect(client.registeredPlates()).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
