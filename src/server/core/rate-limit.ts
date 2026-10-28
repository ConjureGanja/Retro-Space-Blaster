import { redis } from '@devvit/web/server';

/**
 * Fixed-window rate limiter: allow `limit` hits per `windowSeconds` per key.
 *
 * HOW: INCR a counter; the first hit in a window sets its expiry. Once the
 * counter passes `limit`, requests are refused until Redis expires the key.
 * INCR is atomic, so two simultaneous requests can't both sneak in as "#1".
 *
 * Analogy: a club's clicker counter at the door that resets every minute.
 *
 * @returns true if the request is allowed.
 */
export async function allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const count = await redis.incrBy(key, 1);
  if (count === 1) await redis.expire(key, windowSeconds);
  return count <= limit;
}
