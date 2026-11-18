import { redis } from '@devvit/web/server';
import type { SaveData } from '../../shared/api.ts';
import {
  SAVE_KEYS,
  SAVE_VERSION_KEY,
  isSaveVersion,
  validateSave,
  type SaveResult,
  type SaveVersions,
} from '../../shared/validation.ts';
import { keys } from './keys.ts';

export type SaveTx = {
  unwatch(): Promise<unknown>;
  multi(): Promise<void>;
  set(key: string, value: string): Promise<unknown>;
  exec(): Promise<unknown>;
};
export type SaveDb = Pick<typeof redis, 'get'> & { watch(key: string): Promise<SaveTx> };

/**
 * Cloud saves: one JSON blob per Reddit account (keyed by userId, which
 * never changes — unlike a display name, it's safe as a primary key).
 */

export async function loadSave(
  userId: string,
  db: Pick<SaveDb, 'get'> = redis
): Promise<SaveData | null> {
  const raw = await db.get(keys.save(userId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = validateSave(parsed);
    return result.ok ? result.value : null;
  } catch {
    // Corrupt blob shouldn't brick the game — treat it as "no save yet".
    console.error(`[saves] corrupt save for ${userId}, ignoring`);
    return null;
  }
}

function versionsOf(save: SaveData): SaveVersions {
  const metadata = save[SAVE_VERSION_KEY];
  if (typeof metadata !== 'object' || metadata === null) return {};
  const versions: SaveVersions = {};
  for (const key of SAVE_KEYS) {
    const version: unknown = Reflect.get(metadata, key);
    if (isSaveVersion(version)) versions[key] = version;
  }
  return versions;
}

/**
 * Merge per-key last-writer stamps atomically: a stale settings upload must
 * not replace a newer campaign. Missing stamped values are tombstones, kept
 * even after acknowledgement — like a forwarding notice on a closed mailbox.
 * Legacy clients may still update unversioned fields, but cannot overwrite
 * versioned ones. This resolves fields, not conflicting campaign playthroughs.
 */
export async function writeSave(
  userId: string,
  save: SaveData,
  db: SaveDb = redis
): Promise<SaveResult> {
  const key = keys.save(userId);
  for (let attempt = 0; attempt < 5; attempt++) {
    const tx = await db.watch(key);
    let executed = false;
    try {
      const current = (await loadSave(userId, db)) ?? {};
      const previousVersions = versionsOf(current);
      const incomingVersions = versionsOf(save);
      const versions = { ...previousVersions };
      const merged = { ...current };
      for (const field of SAVE_KEYS) {
        const incoming = incomingVersions[field];
        const previous = previousVersions[field];
        if (previous && (!incoming || incoming <= previous)) continue;
        if (!incoming && !Object.hasOwn(save, field)) continue;
        if (Object.hasOwn(save, field)) {
          merged[field] =
            field === 'hiscore' &&
            typeof current[field] === 'number' &&
            typeof save[field] === 'number'
              ? Math.max(current[field], save[field])
              : save[field];
        } else {
          delete merged[field];
        }
        if (incoming) versions[field] = incoming;
      }
      if (Object.keys(versions).length) merged[SAVE_VERSION_KEY] = versions;
      // Individually small snapshots can combine into an oversized save.
      const result = validateSave(merged);
      if (!result.ok) return result;
      await tx.multi();
      await tx.set(key, JSON.stringify(result.value));
      executed = true;
      const committed: unknown = await tx.exec();
      if (Array.isArray(committed) && committed.length > 0) return result;
    } finally {
      // EXEC closes Devvit transactions, including aborted ones. UNWATCH is
      // only for paths that exit before EXEC, like returning invalid input.
      if (!executed) await tx.unwatch();
    }
  }
  throw new Error('save kept conflicting');
}
