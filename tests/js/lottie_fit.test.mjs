import assert from "node:assert/strict";
import { test } from "node:test";
import { CHIP_RING_FILL, ringFit, ringOf } from "../../ovos_visage/static/lottie_fit.js";

const ellipse = (size, stroke, at = [-1.5, -4]) => ({
  ty: "gr",
  it: [
    { ty: "el", s: { k: [size, size] }, p: { k: [0, 0] } },
    { ty: "st", w: { k: stroke } },
    { ty: "tr", p: { k: at } },
  ],
});
// Geometry of OVOS's system/qt5/animations/loading.json (measured): two scaled inner rings, one full-size outer ring.
const LOADING = {
  w: 307,
  h: 389,
  layers: [
    { ks: { p: { k: [154.149, 195.327, 0] }, a: { k: [-2.021, -4, 0] }, s: { k: [71.946, 71.946, 100] }, r: { k: -44 } }, shapes: [ellipse(217, 10)] },
    { ks: { p: { k: [155, 194, 0] }, a: { k: [-1.5, -4, 0] }, s: { k: [100, 100, 100] }, r: { k: [{ t: 0, s: [4.436] }] } }, shapes: [ellipse(217, 5)] },
  ],
};

test("the outer ring of loading.json is centred at (155, 194) with radius 111", () => {
  assert.deepEqual(ringOf(LOADING), { cx: 155, cy: 194, r: 111 });
});

test("the svg is placed so that ring's outer edge lands on the chip ring", () => {
  const fit = ringFit(LOADING);
  const k = CHIP_RING_FILL / 2 / 111;
  assert.equal(fit.width, `${(307 * k * 100).toFixed(3)}%`);
  assert.equal(fit.height, `${(389 * k * 100).toFixed(3)}%`);
  assert.equal(fit.left, `calc(50% - ${(155 * k * 100).toFixed(3)}%)`);
  assert.equal(fit.top, `calc(50% - ${(194 * k * 100).toFixed(3)}%)`);
  assert.equal(fit.width, "135.523%");
});

test("an off-anchor circle is rotated with its layer", () => {
  const layer = { ks: { p: { k: [100, 100, 0] }, a: { k: [0, 0, 0] }, s: { k: [100, 100, 100] }, r: { k: 90 } }, shapes: [ellipse(20, 0, [10, 0])] };
  const ring = ringOf({ w: 200, h: 200, layers: [layer] });
  assert.ok(Math.abs(ring.cx - 100) < 1e-9 && Math.abs(ring.cy - 110) < 1e-9 && ring.r === 10);
});

test("animated scale, animated rotation of an offset circle, or no circle at all give no fit", () => {
  const animatedScale = { ks: { p: { k: [0, 0, 0] }, a: { k: [0, 0, 0] }, s: { k: [{ t: 0, s: [0, 0, 100] }] } }, shapes: [ellipse(100, 4)] };
  const spinningOffset = { ks: { p: { k: [0, 0, 0] }, a: { k: [0, 0, 0] }, s: { k: [100, 100, 100] }, r: { k: [{ t: 0, s: [0] }] } }, shapes: [ellipse(100, 4, [5, 0])] };
  for (const layers of [[animatedScale], [spinningOffset], [{ ks: {}, shapes: [] }], []]) {
    assert.equal(ringFit({ w: 160, h: 160, layers }), null);
  }
});
