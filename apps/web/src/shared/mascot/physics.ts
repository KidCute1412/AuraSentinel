/** Pure fall physics for Aura-kun. Coordinates are viewport pixels; (x, y) is the feet point. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bounces: number;
}
export interface Ground {
  id: string;
  left: number;
  right: number;
  top: number;
}
export interface Landing {
  y: number;
  /** null = viewport floor */
  id: string | null;
}

const GRAVITY = 2200;
const AIR_DRAG = 2.2;
const RESTITUTION = 0.28;
const BOUNCE_MIN_SPEED = 380;

export function stepFall(
  b: Body,
  grounds: Ground[],
  floorY: number,
  bounds: { minX: number; maxX: number },
  dt: number,
): { body: Body; landed: Landing | null } {
  const vy = b.vy + GRAVITY * dt;
  let vx = b.vx * Math.max(0, 1 - AIR_DRAG * dt);
  let x = b.x + vx * dt;
  const y = b.y + vy * dt;
  if (x < bounds.minX) {
    x = bounds.minX;
    vx = Math.abs(vx) * 0.4;
  } else if (x > bounds.maxX) {
    x = bounds.maxX;
    vx = -Math.abs(vx) * 0.4;
  }

  let landY = Infinity;
  let id: string | null = null;
  if (vy > 0) {
    for (const g of grounds) {
      if (x >= g.left && x <= g.right && b.y <= g.top + 2 && y >= g.top && g.top < landY) {
        landY = g.top;
        id = g.id;
      }
    }
    if (y >= floorY && floorY < landY) {
      landY = floorY;
      id = null;
    }
  }

  if (landY === Infinity) return { body: { x, y, vx, vy, bounces: b.bounces }, landed: null };
  if (vy > BOUNCE_MIN_SPEED && b.bounces < 1) {
    return { body: { x, y: landY, vx, vy: -vy * RESTITUTION, bounces: b.bounces + 1 }, landed: null };
  }
  return { body: { x, y: landY, vx: 0, vy: 0, bounces: b.bounces }, landed: { y: landY, id } };
}

/** Where a drop would end up with no animation (reduced motion, route change fallback). */
export function findGroundBelow(x: number, y: number, grounds: Ground[], floorY: number): Landing {
  let best: Landing = { y: floorY, id: null };
  for (const g of grounds) {
    if (x >= g.left && x <= g.right && g.top >= y - 4 && g.top < best.y) best = { y: g.top, id: g.id };
  }
  return best;
}

/** Ease in-out, 0..1 -> 0..1. */
export const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Where a glide (a hop between two standing spots, or a short stroll) is at progress `t` (0..1): straight there with an
 * eased pace, plus an arc of `arc` px at the middle (0 = a walk, bigger = a hop). Pure, so it is tested without a DOM.
 */
export function glidePoint(from: { x: number; y: number }, to: { x: number; y: number }, t: number, arc: number): { x: number; y: number } {
  const c = Math.min(1, Math.max(0, t));
  const e = ease(c);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - arc * 4 * c * (1 - c) };
}
