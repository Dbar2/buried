/**
 * Loads the Unity WebGL build from /unity/ (web/public/unity/, written by `tools/unity.sh build`).
 * Lives in the bridge folder because it is one of the two places allowed to name the Unity loader
 * (the other is UnityView.tsx, which calls into this module).
 *
 * The build's file names depend on the compression setting, so Build.WebGL writes build.json next
 * to the build with the four file names, and this module reads them from there.
 */
import type { UnityLike } from './bridge';

export type UnityBuildFiles = {
  loader: string;
  data: string;
  framework: string;
  wasm: string;
};

export const UNITY_BASE_URL = '/unity/';
export const BUILD_MISSING_MESSAGE = 'Unity build not found; run the Unity build command';

/** The Unity build is missing or unreadable. */
export class UnityBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnityBuildError';
  }
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Read and check build.json. Throws UnityBuildError with a message fit to show. */
export async function fetchBuildFiles(fetchFn: FetchLike = (url) => fetch(url), baseUrl = UNITY_BASE_URL): Promise<UnityBuildFiles> {
  let response;
  try {
    response = await fetchFn(`${baseUrl}build.json`);
  } catch (cause) {
    throw new UnityBuildError(`${BUILD_MISSING_MESSAGE} (${cause instanceof Error ? cause.message : String(cause)})`);
  }
  if (!response.ok) throw new UnityBuildError(BUILD_MISSING_MESSAGE);

  let value: unknown;
  try {
    value = JSON.parse(await response.text());
  } catch {
    // The dev server answers a missing file with the app's index.html.
    throw new UnityBuildError(BUILD_MISSING_MESSAGE);
  }
  return checkBuildFiles(value);
}

export function checkBuildFiles(value: unknown): UnityBuildFiles {
  const record = value as Record<string, unknown> | null;
  const keys = ['loader', 'data', 'framework', 'wasm'] as const;
  if (record === null || typeof record !== 'object') throw new UnityBuildError('build.json is not an object');
  const out = {} as UnityBuildFiles;
  for (const key of keys) {
    const file = record[key];
    if (typeof file !== 'string' || !/^Build\/[A-Za-z0-9_.-]+$/.test(file)) {
      throw new UnityBuildError(`build.json has no usable "${key}" file`);
    }
    out[key] = file;
  }
  return out;
}

type CreateUnityInstance = (
  canvas: HTMLCanvasElement,
  config: Record<string, unknown>,
  onProgress?: (progress: number) => void,
) => Promise<UnityLike & { Quit(): Promise<void> }>;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new UnityBuildError(`The Unity loader could not be loaded from ${src}`));
    document.body.appendChild(script);
  });
}

export type UnityInstance = UnityLike & { Quit(): Promise<void> };

/** Load the loader script and start the Player on a canvas. */
export async function startUnity(
  canvas: HTMLCanvasElement,
  files: UnityBuildFiles,
  onProgress?: (progress: number) => void,
  baseUrl = UNITY_BASE_URL,
): Promise<UnityInstance> {
  await loadScript(baseUrl + files.loader);
  const create = (window as unknown as { createUnityInstance?: CreateUnityInstance }).createUnityInstance;
  if (typeof create !== 'function') throw new UnityBuildError('The Unity loader did not define createUnityInstance');

  return create(
    canvas,
    {
      dataUrl: baseUrl + files.data,
      frameworkUrl: baseUrl + files.framework,
      codeUrl: baseUrl + files.wasm,
      streamingAssetsUrl: 'StreamingAssets',
      companyName: 'Buried',
      productName: 'Buried',
      productVersion: '0.1.0',
    },
    onProgress,
  );
}
