import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const local = new Map<string, string>();
const jobs: Array<{ save: Record<string, unknown>; ack: () => void }> = [];
let remote: unknown = null;
const cloud = {
  username: 'pilot',
  subreddit: 'space',
  best: 0,
  init: async () => remote,
  queueSave: (save: Record<string, unknown>, ack: () => void) => jobs.push({ save, ack }),
};

// Isolate only the Reddit bridge; every tab runs the real store and validator.
Reflect.set(globalThis, '__storeTestCloud', cloud);
Reflect.set(globalThis, 'localStorage', {
  get length() {
    return local.size;
  },
  key: (index: number) => [...local.keys()][index] ?? null,
  getItem: (key: string) => local.get(key) ?? null,
  setItem: (key: string, value: string) => local.set(key, value),
  removeItem: (key: string) => local.delete(key),
});
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/game/platform/cloud.js')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export const Cloud = globalThis.__storeTestCloud;',
      };
    }
    return nextLoad(url, context);
  },
});

let tab = 0;
async function newTab() {
  const path = new URL(`../client/game/store.js?tab=${tab++}`, import.meta.url).href;
  const { store } = await import(path);
  await store.hydrate();
  return store;
}

const prefix = 'rsb_u_space_pilot_';
const put = (key: string, value: unknown) => local.set(prefix + key, JSON.stringify(value));
const latest = () => {
  const job = jobs.at(-1);
  assert.ok(job);
  return job;
};

beforeEach(() => {
  local.clear();
  jobs.length = 0;
  remote = null;
  cloud.best = 0;
  cloud.username = 'pilot';
});

test('deletes survive offline hydrate, acknowledgement, and stale cloud data', async () => {
  remote = { campaign: { unlocked: ['n1'] } };
  const store = await newTab();
  store.remove('campaign');
  const deletion = latest();
  assert.equal('campaign' in deletion.save, false);
  assert.ok(deletion.save.__versions);
  assert.equal((await newTab()).get('campaign', null), null);
  deletion.ack();
  assert.equal((await newTab()).get('campaign', null), null);
});

test('an old tab acknowledgement cannot clear another tab newer edit or deletion', async () => {
  const first = await newTab();
  const second = await newTab();
  first.set('theme', 'theme-neon');
  const old = latest();
  second.set('theme', 'theme-amber');
  old.ack();
  jobs.length = 0;
  const refreshed = await newTab();
  assert.equal(refreshed.get('theme'), 'theme-amber');
  assert.equal(latest().save.theme, 'theme-amber', 'new edit is still dirty');

  const edit = latest();
  second.remove('theme');
  edit.ack();
  remote = { theme: 'theme-neon' };
  jobs.length = 0;
  assert.equal((await newTab()).get('theme', null), null);
  assert.equal('theme' in latest().save, false, 'new deletion is still dirty');
});

test('snapshot re-reads sibling tab changes without restamping unchanged fields', async () => {
  const first = await newTab();
  const second = await newTab();
  first.set('campaign', { unlocked: ['n1', 'n2'] });
  const campaign = latest().save.__versions;
  second.set('hd', true);
  assert.deepEqual(latest().save.campaign, { unlocked: ['n1', 'n2'] });
  assert.equal(
    Reflect.get(latest().save.__versions ?? {}, 'campaign'),
    Reflect.get(campaign ?? {}, 'campaign')
  );
});

test('a delayed hydrate cannot overwrite a newer tab tombstone', async () => {
  const second = await newTab();
  const version = '0001700000000000-00000000-0000-4000-8000-000000000001';
  remote = { theme: 'theme-neon', __versions: { theme: version } };
  const storage = Reflect.get(globalThis, 'localStorage');
  const original = storage.setItem;
  let interleaved = false;
  storage.setItem = (key: string, value: string) => {
    if (!interleaved && key.includes(`__state_theme_${version}`)) {
      interleaved = true;
      second.remove('theme');
    }
    original(key, value);
  };
  try {
    await newTab();
  } finally {
    storage.setItem = original;
  }
  assert.equal(interleaved, true);
  jobs.length = 0;
  assert.equal((await newTab()).get('theme', null), null);
  assert.equal('theme' in latest().save, false);
});

test('legacy dirty arrays migrate values and missing-key tombstones once', async () => {
  put('__unsynced', ['campaign', 'volMusic', 'unknown']);
  put('volMusic', '0.5');
  remote = { campaign: { victory: true }, volMusic: 1 };
  const store = await newTab();
  assert.equal(store.get('campaign', null), null);
  assert.equal(store.get('volMusic'), 0.5);
  assert.equal(local.has(prefix + '__unsynced'), false);
  latest().ack();
  jobs.length = 0;
  await newTab();
  assert.equal(jobs.length, 0, 'acknowledged migration does not upload again');
});

test('invalid local/cloud values never enter cache; valid siblings survive', async () => {
  put('campaign', { unlocked: false });
  put('hd', 'yes');
  put('volMusic', '0.25');
  put('hiscore', -5);
  remote = { campaign: [], difficulty: 'godmode', volSfx: 0.8, introSeen: true };
  const store = await newTab();
  for (const key of ['campaign', 'hd', 'hiscore', 'difficulty']) {
    assert.equal(store.get(key, null), null);
  }
  assert.equal(store.get('volMusic'), 0.25);
  assert.equal(store.get('volSfx'), 0.8);
  store.set('campaign', { completed: [] });
  assert.equal(store.get('campaign', null), null);
});

test('cloud versions and tombstones beat older local records and cache resets on hydrate', async () => {
  const store = await newTab();
  store.set('theme', 'theme-neon');
  const version = '0009999999999999-00000000-0000-4000-8000-000000000001';
  remote = { __versions: { theme: version }, hd: true };
  await store.hydrate();
  assert.equal(store.get('theme', null), null);
  assert.equal(store.get('hd'), true);
  cloud.username = 'another';
  remote = null;
  await store.hydrate();
  assert.equal(store.get('hd', null), null);
});

test('storage failures retain in-memory dirty values without throwing', async () => {
  const storage = Reflect.get(globalThis, 'localStorage');
  Reflect.set(globalThis, 'localStorage', {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  });

  try {
    const store = await newTab();
    store.set('hd', true);
    assert.equal(store.get('hd'), true);
    store.remove('hd');
    assert.equal(store.get('hd', null), null);
    latest().ack();
  } finally {
    Reflect.set(globalThis, 'localStorage', storage);
  }
});

test('high scores merge by maximum even when a lower score has a newer stamp', async () => {
  const store = await newTab();
  store.set('hiscore', 100);
  remote = {
    hiscore: 10,
    __versions: { hiscore: '0009999999999999-00000000-0000-4000-8000-000000000001' },
  };
  await store.hydrate();
  assert.equal(store.get('hiscore'), 100);
  assert.equal(latest().save.hiscore, 100);
});
