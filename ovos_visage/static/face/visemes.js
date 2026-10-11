// Mycroft viseme codes 0-6 as mouth outlines, the viseme timeline, and shape tweening. Pure; tested under node.
//
// Codes come from ovos_utils/lang/visimes.py (phoneme -> code); shapes redraw the Mark 1 firmware MOUTH_VISEMES
// bitmaps smooth. Every shape has the same point count so any two can be interpolated point by point.
export const REST_CODE = 4;
const LIP_POINTS = 9;
const MOUTH_CX = 100;
const MOUTH_CY = 50;

// w: half width; up/down: lip opening at the centre; round: 1 = parabola, < 1 = squarer; smile: corner lift.
// Open shapes are drawn as hollow outlines with a stroke of about 15 units, so each keeps a centre opening of at
// least ~22 units (and a half width of at least ~14) to leave a visible gap inside the stroke.
const SHAPES = {
  0: { w: 46, up: 5, down: 30, round: 0.6, smile: 4 }, // ae ah iy ay hh: wide open, flat top
  1: { w: 18, up: 20, down: 20, round: 0.5, smile: 0 }, // aw: small tall oval
  2: { w: 22, up: 17, down: 17, round: 0.35, smile: 0 }, // uh w r ow er: rounded O
  3: { w: 34, up: 4, down: 20, round: 0.7, smile: 3 }, // th s sh n t d l k g: half open
  4: { w: 56, up: 0, down: 0, round: 1, smile: 7 }, // b p m, pause: closed smile (Kickstarter sag, SPEC 9)
  5: { w: 34, up: 11, down: 11, round: 0.4, smile: 2 }, // f v: narrow lens
  6: { w: 16, up: 14, down: 14, round: 0.5, smile: 0 }, // oy ao: tiny round
};

function lipY(shape, x, opening, sign) {
  const u = Math.abs(x) / shape.w;
  const bulge = Math.pow(Math.max(0, 1 - u * u), shape.round);
  return MOUTH_CY + sign * opening * bulge - shape.smile * u * u;
}

/** openScale shrinks or grows every open shape (all but rest) uniformly, so the rest smile keeps its width. */
export function shapePoints(code, openScale = 1) {
  const base = SHAPES[code] ?? SHAPES[REST_CODE];
  const k = base === SHAPES[REST_CODE] ? 1 : openScale;
  const shape = { ...base, w: base.w * k, up: base.up * k, down: base.down * k };
  // Cosine spacing samples the steep ends of each lip densely, so hollow outlines stay smooth at the corners.
  const xs = Array.from({ length: LIP_POINTS }, (_, i) => -shape.w * Math.cos((Math.PI * i) / (LIP_POINTS - 1)));
  const upper = xs.map((x) => [MOUTH_CX + x, lipY(shape, x, shape.up, -1)]);
  const lower = xs.slice(1, -1).reverse().map((x) => [MOUTH_CX + x, lipY(shape, x, shape.down, 1)]);
  return [...upper, ...lower];
}

export function mouthShapes(openScale = 1) {
  return Object.fromEntries(Object.keys(SHAPES).map((code) => [code, shapePoints(Number(code), openScale)]));
}

export const MOUTH_SHAPES = mouthShapes();

export function lerpPoints(from, to, k) {
  return from.map(([x, y], i) => [x + (to[i][0] - x) * k, y + (to[i][1] - y) * k]);
}

// Closed Catmull-Rom spline through the points, as cubic Beziers.
export function toPath(points) {
  const n = points.length;
  const at = (i) => points[(i + n) % n];
  const fmt = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  let d = `M ${fmt(points[0])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${fmt(c1)} ${fmt(c2)} ${fmt(p2)}`;
  }
  return `${d} Z`;
}

/**
 * The viseme code at `t` seconds after speech start, or null after the list ends.
 * Pairs are [code, cumulative end time] (ovos_bus_client EnclosureApi.mouth_viseme; measured monotonic live):
 * code k is shown from the previous end time until its own end time.
 */
export function visemeAt(visemes, t) {
  if (t < 0) return null;
  for (const [code, end] of visemes) {
    if (t < Number(end)) return Number(code);
  }
  return null;
}
