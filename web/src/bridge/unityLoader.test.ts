import { describe, expect, it } from 'vitest';
import { BUILD_MISSING_MESSAGE, UnityBuildError, checkBuildFiles, fetchBuildFiles } from './unityLoader';
import type { FetchLike } from './unityLoader';

const files = {
  loader: 'Build/unity.loader.js',
  data: 'Build/unity.data.br',
  framework: 'Build/unity.framework.js.br',
  wasm: 'Build/unity.wasm.br',
};

const respond = (ok: boolean, body: string, status = ok ? 200 : 404): FetchLike =>
  async () => ({ ok, status, text: async () => body });

describe('fetchBuildFiles', () => {
  it('reads the four file names from build.json', async () => {
    await expect(fetchBuildFiles(respond(true, JSON.stringify(files)))).resolves.toEqual(files);
  });

  it('asks for build.json under the Unity folder', async () => {
    const urls: string[] = [];
    await fetchBuildFiles(async (url) => {
      urls.push(url);
      return { ok: true, status: 200, text: async () => JSON.stringify(files) };
    });
    expect(urls).toEqual(['/unity/build.json']);
  });

  it('says the build is missing when the file is a 404', async () => {
    await expect(fetchBuildFiles(respond(false, 'Not found'))).rejects.toThrow(BUILD_MISSING_MESSAGE);
  });

  it('says the build is missing when the dev server answers with the app page instead', async () => {
    await expect(fetchBuildFiles(respond(true, '<!doctype html><html></html>'))).rejects.toThrow(BUILD_MISSING_MESSAGE);
  });

  it('says the build is missing when the request fails', async () => {
    const failing: FetchLike = async () => {
      throw new Error('offline');
    };
    await expect(fetchBuildFiles(failing)).rejects.toThrow(BUILD_MISSING_MESSAGE);
  });
});

describe('checkBuildFiles', () => {
  it('refuses a missing or odd file name', () => {
    expect(() => checkBuildFiles({ ...files, wasm: undefined })).toThrow(UnityBuildError);
    expect(() => checkBuildFiles({ ...files, data: '../secret' })).toThrow(UnityBuildError);
    expect(() => checkBuildFiles({ ...files, loader: 'Build/a b.js' })).toThrow(UnityBuildError);
    expect(() => checkBuildFiles(null)).toThrow(UnityBuildError);
  });
});
