import assert from "node:assert/strict";
import { test } from "node:test";
import { ANIMATIONS, liveSegment, mount, statusAnimation } from "../../ovos_visage/static/lottie.js";

// The layer timing of OVOS's status-fail.json (measured): composition op 45, every layer op 40.
const FAIL_TIMING = { ip: 0, op: 45, layers: [{ op: 40 }, { op: 40 }, { op: 40 }] };

function fakes(status = 200) {
  const loads = [];
  const destroyed = [];
  const lottie = {
    loadAnimation(options) {
      const animation = { options, destroy: () => destroyed.push(options.animationData.nm) };
      loads.push(animation);
      return animation;
    },
  };
  const fetcher = async (url) => ({ ok: status === 200, status, json: async () => ({ nm: url, ...FAIL_TIMING }) });
  return { loads, destroyed, options: { player: async () => lottie, fetcher } };
}

test("status picks OVOS's success or fail file from the system cache", () => {
  assert.equal(statusAnimation(true), "/res/system/qt5/animations/status-success.json");
  assert.equal(statusAnimation(false), "/res/system/qt5/animations/status-fail.json");
  assert.equal(ANIMATIONS.loading, "/res/system/qt5/animations/loading.json");
});

test("mount plays the fetched file with the svg renderer and destroy stops it", async () => {
  const { loads, destroyed, options } = fakes();
  const el = {};
  const handle = mount(el, statusAnimation(true), { ...options, loop: false });
  assert.equal(await handle.ready, true);
  assert.equal(loads.length, 1);
  const { container, renderer, loop, autoplay, animationData } = loads[0].options;
  assert.deepEqual([container, renderer, loop, autoplay, animationData.nm], [el, "svg", false, true, ANIMATIONS.success]);
  handle.destroy();
  handle.destroy();
  assert.deepEqual(destroyed, [ANIMATIONS.success]);
  assert.equal(handle.animation, null);
});

test("unmounting before the file arrives never starts an animation", async () => {
  const { loads, options } = fakes();
  const handle = mount({}, ANIMATIONS.loading, options);
  handle.destroy();
  assert.equal(await handle.ready, false);
  assert.equal(loads.length, 0);
});

test("a file missing from this install's cache resolves ready=false for the fallback", async () => {
  const { loads, options } = fakes(404);
  const original = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await mount({}, ANIMATIONS.fail, options).ready, false);
  } finally {
    console.warn = original;
  }
  assert.equal(loads.length, 0);
});

test("a one-shot plays only up to its last live layer frame, so it holds the drawn mark, not the empty outro", async () => {
  assert.deepEqual(liveSegment(FAIL_TIMING), [0, 40]);
  assert.deepEqual(liveSegment({ ip: 0, op: 40, layers: [{ op: 40 }] }), [0, 40]);
  assert.deepEqual(liveSegment({ ip: 2, op: 70, layers: [{}] }), [2, 70]);
  const once = fakes();
  await mount({}, statusAnimation(false), { ...once.options, loop: false }).ready;
  assert.deepEqual(once.loads[0].options.initialSegment, [0, 40]);
  const looping = fakes();
  await mount({}, ANIMATIONS.loading, { ...looping.options, loop: true }).ready;
  assert.equal(looping.loads[0].options.initialSegment, undefined);
});
