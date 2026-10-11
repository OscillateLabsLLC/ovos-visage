import assert from "node:assert/strict";
import { test } from "node:test";
import { anchorFor, coverUrl, formatTime, isSyncPlayer, playbackState, progressAt, trackModel } from "../../ovos_visage/static/pages/ocp_model.js";

const SONG = { uri: "https://x/song.mp3", title: "Song", artist: "Band", status: "Playing", duration: "200000", position: 0 };

test("cover art: only URLs a browser can load; raw filesystem paths fall back to the glyph", () => {
  assert.equal(coverUrl("https://somafm.com/img3/groovesalad-400.jpg"), "https://somafm.com/img3/groovesalad-400.jpg");
  assert.equal(coverUrl("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(coverUrl("/res/ovos.common_play/cover.png"), "/res/ovos.common_play/cover.png");
  assert.equal(coverUrl("/res-abs/0123456789abcdef01234567"), "/res-abs/0123456789abcdef01234567");
  assert.equal(coverUrl("/home/ovos/.venvs/ovos/lib/python3.11/site-packages/ovos_plugin_common_play/ocp/res/ui/images/ocp.png"), null);
  assert.equal(coverUrl(""), null);
  assert.equal(coverUrl(undefined), null);
});

test("status words, times and backends", () => {
  assert.deepEqual(["Playing", "Paused", "Stopped", undefined, "weird"].map(playbackState), ["playing", "paused", "stopped", "stopped", "stopped"]);
  assert.deepEqual([0, 5400, 65000, 213000, 3725000].map(formatTime), ["0:00", "0:05", "1:05", "3:33", "1:02:05"]);
  assert.equal(isSyncPlayer({ playerBackend: "OVOSSyncPlayer" }), true);
  assert.equal(isSyncPlayer({ playerBackend: "OVOSWebPlayer" }), false);
  assert.equal(isSyncPlayer({}), true);
});

test("the track's own duration is the total; the seekbar length never is", () => {
  assert.equal(trackModel({ ...SONG, length: 180000 }).durationMs, 200000);
  assert.equal(trackModel({ ...SONG, duration: "0" }).live, true);
  assert.equal(trackModel({}).title, "Unknown track");
});

test("measured finite track: position in seconds, duration and length in ms", () => {
  const moonlight = { ...SONG, duration: 339000, length: 338561 };
  const reports = [33.56, 35.56, 37.6, 39.64].map((position) => trackModel({ ...moonlight, position }));
  assert.deepEqual(reports.map((t) => t.positionMs), [33560, 35560, 37600, 39640]);
  assert.ok(reports.every((t) => !t.live && t.durationMs === 339000));
  assert.equal(progressAt(reports[0]).fraction, 33560 / 339000);
});

test("a position already in ms (after an OCP seek) is kept: it would overshoot as seconds", () => {
  assert.equal(trackModel({ ...SONG, position: 120000 }).positionMs, 120000);
  assert.equal(trackModel({ ...SONG, position: 120 }).positionMs, 120000);
});

test("measured live stream: duration 0, length grows with position; the ring stays full", () => {
  const stream = { uri: "https://ice1.somafm.com/groovesalad-128-mp3", title: "Groove Salad", status: "Playing", duration: 0 };
  const samples = [[14, 43284], [16, 45270], [18, 47333], [20, 49554]];
  let previous = null;
  const models = samples.map(([position, length]) => (previous = trackModel({ ...stream, position, length }, previous)));
  assert.ok(models.every((t) => t.live && t.durationMs === 0));
  assert.deepEqual(models.map((t) => t.positionMs), [14000, 16000, 18000, 20000]);
  assert.deepEqual(models.map((t) => progressAt(t, 1500).fraction), [1, 1, 1, 1]);
  assert.equal(progressAt(models[3], 1500).elapsed, "0:21");
});

test("a claimed duration with a buffer length that grows in step with position still reads as live", () => {
  const claimed = { ...SONG, duration: 600000 };
  const first = trackModel({ ...claimed, position: 14, length: 43284 });
  const second = trackModel({ ...claimed, position: 16, length: 45270 }, first);
  assert.equal(first.live, false);
  assert.equal(second.live, true);
  const steady = trackModel({ ...claimed, position: 16, length: 43284 }, first);
  assert.equal(steady.live, false);
});

test("progress advances only while playing and stops at the end", () => {
  const playing = trackModel(SONG);
  assert.equal(progressAt(playing, 50000).fraction, 0.25);
  assert.equal(progressAt(playing, 999999).positionMs, 200000);
  assert.equal(progressAt(trackModel({ ...SONG, status: "Paused" }), 50000).positionMs, 0);
  const live = progressAt(trackModel({ ...SONG, duration: 0 }), 42000);
  assert.deepEqual([live.fraction, live.elapsed, live.total], [1, "0:42", "live"]);
});

test("unrelated updates keep the clock running; pause freezes it; resume continues from there", () => {
  let anchor = anchorFor(null, trackModel(SONG), 0);
  anchor = anchorFor(anchor, trackModel({ ...SONG, app_view_timeout: 30 }), 10000);
  assert.equal(anchor.positionMs, 10000);
  anchor = anchorFor(anchor, trackModel({ ...SONG, status: "Paused" }), 16000);
  assert.equal(anchor.positionMs, 16000);
  anchor = anchorFor(anchor, trackModel({ ...SONG, status: "Playing" }), 30000);
  assert.equal(anchor.positionMs, 16000);
  assert.equal(progressAt({ ...trackModel(SONG), positionMs: anchor.positionMs }, 4000).positionMs, 20000);
});

test("a new track that inherits the old track's position (measured: OCP leaves it in place) starts at 0", () => {
  const playing = anchorFor(null, trackModel({ ...SONG, position: 42.96 }), 0);
  const next = anchorFor(playing, trackModel({ ...SONG, title: "Next", position: 42.96 }), 1000);
  assert.equal(next.positionMs, 0);
  const reported = anchorFor(next, trackModel({ ...SONG, title: "Next", position: 1.84 }), 3000);
  assert.equal(reported.positionMs, 1840);
});

test("a new track, a stop or a reported position restarts the clock", () => {
  const running = anchorFor(anchorFor(null, trackModel(SONG), 0), trackModel(SONG), 14000);
  assert.equal(running.positionMs, 14000);
  assert.equal(anchorFor(running, trackModel({ ...SONG, title: "Next" }), 15000).positionMs, 0);
  assert.equal(anchorFor(running, trackModel({ ...SONG, status: "Stopped" }), 15000).positionMs, 0);
  assert.equal(anchorFor(running, trackModel({ ...SONG, position: 90000 }), 15000).positionMs, 90000);
});

test("a paused record eases to the nearest upright, never more than half a turn", async () => {
  const { uprightTarget } = await import("../../ovos_visage/static/pages/ocp_model.js");
  assert.deepEqual([0, 30, 179, 180, 300, -62, -170, -10, 540].map(uprightTarget), [0, 0, 0, 360, 360, 360, 360, 360, 360]);
});
