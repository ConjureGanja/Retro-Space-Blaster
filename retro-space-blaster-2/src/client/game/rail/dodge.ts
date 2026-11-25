/**
 * Can the ship actually walk out of a pattern?
 *
 * A volley is fair when there is a route through it that never steps farther
 * in one frame than the ship can move. We raster the playfield into cells
 * one king-move apart (a diagonal step is exactly the ship's speed) and
 * flood-fill forward in time.
 *
 * Analogy: checking a dance chart with a ruler. If the safe square jumps
 * across the floor faster than your feet, the chart is a trap.
 */

export type Threat = { x: number; y: number; r: number };

function blocked(threats: Threat[], x: number, y: number): boolean {
  for (const threat of threats) {
    const dx = x - threat.x;
    const dy = y - threat.y;
    if (dx * dx + dy * dy < threat.r * threat.r) return true;
  }
  return false;
}

/**
 * `frames[t]` is every circle that can hurt on that frame. Radius must
 * already include the ship's body. Returns false when every route gets tagged.
 */
export function pathExists(
  frames: Threat[][],
  speed: number,
  start: { x: number; y: number },
  bounds: { x: number; y: number }
): boolean {
  if (speed <= 0) return false;
  // Diagonal of this cell is `speed`, so a king-move never outruns the ship.
  const cell = speed / Math.SQRT2;
  const cols = Math.floor((bounds.x * 2) / cell) + 1;
  const rows = Math.floor((bounds.y * 2) / cell) + 1;
  const xOf = (col: number) => -bounds.x + col * cell;
  const yOf = (row: number) => -bounds.y + row * cell;
  const colOf = (x: number) => Math.round((x + bounds.x) / cell);
  const rowOf = (y: number) => Math.round((y + bounds.y) / cell);
  let curr = new Uint8Array(cols * rows);
  let next = new Uint8Array(cols * rows);
  const sc = colOf(start.x);
  const sr = rowOf(start.y);
  if (sc < 0 || sr < 0 || sc >= cols || sr >= rows) return false;
  const origin = sr * cols + sc;
  curr[origin] = 1;

  for (const threats of frames) {
    next.fill(0);
    let any = false;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!curr[row * cols + col]) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nc = col + dx;
            const nr = row + dy;
            if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
            const x = xOf(nc);
            const y = yOf(nr);
            if (Math.abs(x) > bounds.x || Math.abs(y) > bounds.y) continue;
            if (blocked(threats, x, y)) continue;
            const index = nr * cols + nc;
            if (!next[index]) {
              next[index] = 1;
              any = true;
            }
          }
        }
      }
    }
    if (!any) return false;
    const swap = curr;
    curr = next;
    next = swap;
  }
  return true;
}
