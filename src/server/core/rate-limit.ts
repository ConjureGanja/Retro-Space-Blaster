import { redis } from '@devvit/web/server';

/**
 * Fixed-window rate limiter: allow `limit` hits per `windowSeconds` per key.
 *
 * HOW: INCR a counter; the first hit in a window sets its expiry. Once the
 * counter passes `limit`, requests are refused until Redis expires the key.
 * INCR is atomic, so two simultaneous requests can't both sneak in as "#1".
 *
 * SELF-HEALING: INCR and EXPIRE are two calls. If the EXPIRE ever failed (or
 * the function stopped between them), the counter would never reset and the
 * player would be locked out for good. So whenever we're about to refuse, we
 * check the key really has a TTL and give it one if not — worst case, one
 * extra window of limiting instead of a permanent ban.
 *
 * Analogy: a club's clicker counter at the door that resets every minute —
 * and if the reset timer ever jams, the bouncer restarts it instead of
 * keeping everyone out forever.
 *
 * @returns true if the request is allowed.
 */
export async function allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const count = await redis.incrBy(key, 1);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
    return true;
  }
  if (count <= limit) return true;

  // About to refuse: make sure this counter can actually expire.
  const expiresAt = await redis.expireTime(key);
  if (expiresAt < 0) await redis.expire(key, windowSeconds);
  return false;
}
