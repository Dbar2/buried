/**
 * Write the bridge messages the first visit sends the Player before Raise, for `Buried.Editor.Still.Render`
 * (spec 06 task U9): scene/init, then scene/loadEra for the 1911 era with `held: true` (the landing look), built by the
 * same functions the Shell uses (buildGateModel, buildSceneInit, buildLoadEra) from the repository's data/.
 *
 * Run from web/:  npm run gen:still-scene
 * Output: data/work/still/scene.json (gitignored), read by Unity. The ids whose anchors the Still records are the
 * ones named by data/finds.json when it exists, else the bank and the factory of the brief
 * (`bld_fip_v3_1911_229_0001`, `bld_fip_v3_1911_229_0101`) that the 1911 era holds.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../src/data/loadData';
import { buildGateModel } from '../src/explorer/gateModel';
import { buildLoadEra, buildSceneInit, listForPlayer } from '../src/explorer/gateScene';
import { REPOSITORY_DATA, diskFetch } from '../src/explorer/testing/diskFetch';

const ERA = '1911';
const FALLBACK_IDS = ['bld_fip_v3_1911_229_0001', 'bld_fip_v3_1911_229_0101'];

const model = buildGateModel(await loadData(diskFetch(REPOSITORY_DATA)));
const era = model.order.find((e) => e.id === ERA);
const list = model.lists.get(ERA);
if (!era || !list) throw new Error(`the project has no era ${ERA}`);

const init = buildSceneInit(model.project, model.order, model.initialView, model.present, { reducedMotion: false, debug: false });
const loadEra = buildLoadEra(era, listForPlayer(list, true), model.drapes.get(ERA) ?? []);
loadEra.payload.held = true;

// The finds' feature ids, in find order, when data/finds.json exists (spec 06 P1).
const heldIds = new Set(loadEra.payload.features.map((f) => f.id));
let wanted: string[] = FALLBACK_IDS;
const findsPath = join(REPOSITORY_DATA, 'finds.json');
if (existsSync(findsPath)) {
  const finds = JSON.parse(readFileSync(findsPath, 'utf8')) as { finds?: { feature_id?: string; order?: number }[] };
  const ids = (finds.finds ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((f) => f.feature_id)
    .filter((id): id is string => typeof id === 'string');
  if (ids.length > 0) wanted = ids;
}
const anchors = wanted.filter((id) => heldIds.has(id));

const out = fileURLToPath(new URL('../../data/work/still/scene.json', import.meta.url));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ messages: [init, loadEra], anchors }, null, 2)}\n`, 'utf8');
console.log(`wrote ${out}: ${init.payload.present.length} present buildings, ${loadEra.payload.features.length} features, anchors ${anchors.join(', ') || '(none)'}`);
