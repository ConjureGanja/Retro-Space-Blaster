import { redis } from '@devvit/web/server';
import type { SaveData } from '../../shared/api.ts';
import { keys } from './keys.ts';

/**
 * Cloud saves: one JSON blob per Reddit account (keyed by userId, which
 * never changes — unlike a display name, it's safe as a primary key).
 */

export async function loadSave(userId: string): Promise<SaveData | null> {
  const raw = await redis.get(keys.save(userId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed))
      : null;
  } catch {
    // Corrupt blob shouldn't brick the game — treat it as "no save yet".
    console.error(`[saves] corrupt save for ${userId}, ignoring`);
    return null;
  }
}

/** `save` must already be validated (see validateSave in src/shared). */
export async function writeSave(userId: string, save: SaveData): Promise<void> {
  await redis.set(keys.save(userId), JSON.stringify(save));
}
