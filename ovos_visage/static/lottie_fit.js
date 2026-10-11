// Where a Lottie's main ring is, read from its JSON, so the drawn ring can be sized to a chip's ring instead of the
// composition box (OVOS's loading.json is a 307x389 canvas whose ring is 222 wide). Pure; tested under node.

// The chip ring from widgets.js ring(): r 46 plus half a stroke of 6, in a 100-unit box, so its outer edge is 0.98.
export const CHIP_RING_FILL = 0.98;

const fixed = (prop) => (Array.isArray(prop?.k) && typeof prop.k[0] === "number" ? prop.k : null);
const number = (prop, fallback) => (typeof prop?.k === "number" ? prop.k : fallback);

function rotate([x, y], degrees) {
  const rad = (degrees * Math.PI) / 180;
  return [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)];
}

/** Circles in one shape layer, in composition coordinates; skips anything animated that would move them. */
function layerRings(layer) {
  const [p, a, s] = [fixed(layer.ks?.p), fixed(layer.ks?.a), fixed(layer.ks?.s)];
  if (!p || !a || !s || s[0] !== s[1]) return [];
  const scale = s[0] / 100;
  return (layer.shapes ?? [])
    .filter((group) => group.ty === "gr")
    .flatMap((group) => {
      const find = (ty) => group.it?.find((item) => item.ty === ty);
      const size = fixed(find("el")?.s);
      if (!size || size[0] !== size[1]) return [];
      const at = [fixed(find("el").p) ?? [0, 0], fixed(find("tr")?.p) ?? [0, 0]];
      const offset = [at[0][0] + at[1][0] - a[0], at[0][1] + at[1][1] - a[1]];
      const moved = offset[0] || offset[1];
      if (moved && typeof layer.ks?.r?.k !== "number") return [];
      const [dx, dy] = rotate(offset, number(layer.ks?.r, 0));
      const r = (size[0] / 2 + number(find("st")?.w, 0) / 2) * scale;
      return [{ cx: p[0] + dx * scale, cy: p[1] + dy * scale, r }];
    });
}

/** The largest static circle in the animation, or null when it has none. */
export function ringOf(data) {
  const rings = (data.layers ?? []).flatMap(layerRings);
  return rings.reduce((best, ring) => (!best || ring.r > best.r ? ring : best), null);
}

/** Placement of the animation's svg, in % of the chip, that puts its ring's outer edge on the chip ring. */
export function ringFit(data, fill = CHIP_RING_FILL) {
  const ring = ringOf(data);
  if (!ring) return null;
  const k = fill / 2 / ring.r;
  const pct = (value) => `${(value * k * 100).toFixed(3)}%`;
  return { width: pct(data.w), height: pct(data.h), left: `calc(50% - ${pct(ring.cx)})`, top: `calc(50% - ${pct(ring.cy)})` };
}
