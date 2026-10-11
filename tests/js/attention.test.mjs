import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Attention, FADE_AFTER_AUDIO_MS, STUCK_MS, isContentPage } from "../../ovos_visage/static/attention.js";

class FakeTimers {
  constructor() {
    this.now = 0;
    this.pending = new Map();
    this.next = 1;
  }
  setTimeout(fn, ms) {
    const id = this.next++;
    this.pending.set(id, { at: this.now + ms, fn });
    return id;
  }
  clearTimeout(id) {
    this.pending.delete(id);
  }
  advance(ms) {
    this.now += ms;
    for (const [id, { at, fn }] of [...this.pending]) {
      if (at <= this.now) {
        this.pending.delete(id);
        fn();
      }
    }
  }
}

function setup() {
  const classes = new Set();
  const element = { dataset: {}, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } };
  const face = { modes: [], visemes: [], widened: 0 };
  face.setMode = (m) => face.modes.push(m);
  face.playVisemes = (v) => face.visemes.push(v);
  face.widen = () => face.widened++;
  const timers = new FakeTimers();
  return {
    attention: new Attention(element, face, timers),
    element,
    face,
    timers,
    shown: () => classes.has("shown"),
    compact: () => classes.has("compact"),
  };
}

const IDLE_NS = "ovos-skill-homescreen.openvoiceos";

const live = readFileSync(new URL("../fixtures/corebus/visemes_what_time_is_it.jsonl", import.meta.url), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

test("live speech sequence: shown while speaking with visemes, fades a second after audio ends", () => {
  const { attention, face, timers, shown } = setup();
  attention.handle("recognizer_loop:utterance");
  assert.ok(shown());
  assert.equal(attention.mode, "thinking");
  for (const msg of live) attention.handle(msg.type, msg.data);
  assert.deepEqual(face.visemes, [live[2].data.visemes]);
  assert.ok(face.modes.includes("speaking"));
  assert.equal(attention.mode, "rest");
  timers.advance(FADE_AFTER_AUDIO_MS - 1);
  assert.ok(shown());
  timers.advance(1);
  assert.ok(!shown());
});

test("listening widens the eyes, then thinking, then a second utterance cancels the fade", () => {
  const { attention, face, timers, shown, element } = setup();
  attention.handle("ovos.listener.record.started");
  assert.equal(element.dataset.state, "listening");
  assert.equal(face.widened, 1);
  attention.handle("ovos.listener.record.ended");
  assert.equal(attention.mode, "thinking");
  attention.handle("recognizer_loop:audio_output_start");
  attention.handle("recognizer_loop:audio_output_end");
  timers.advance(FADE_AFTER_AUDIO_MS / 2);
  attention.handle("recognizer_loop:audio_output_start");
  timers.advance(FADE_AFTER_AUDIO_MS * 2);
  assert.ok(shown());
  assert.equal(attention.mode, "speaking");
});

test("stuck thinking hides after the guard; visemes are ignored while hidden", () => {
  const { attention, face, timers, shown } = setup();
  attention.handle("enclosure.mouth.viseme_list", { visemes: [["0", 1]] });
  assert.deepEqual(face.visemes, []);
  attention.handle("mycroft.skill.handler.start");
  timers.advance(STUCK_MS);
  assert.ok(!shown());
});

test("content pages get the compact face; idle, SYSTEM_Face and blank get the full face", () => {
  assert.equal(isContentPage({ namespace: IDLE_NS, page: "idle" }, IDLE_NS), false);
  assert.equal(isContentPage({ namespace: "visage-face-test", page: "SYSTEM_Face" }, IDLE_NS), false);
  assert.equal(isContentPage({ namespace: "", page: "" }, IDLE_NS), false);
  assert.equal(isContentPage(null, IDLE_NS), false);
  assert.equal(isContentPage({ namespace: "ovos-skill-weather.openvoiceos", page: "CurrentWeather" }, IDLE_NS), true);
  assert.equal(isContentPage({ namespace: "ovos-skill-alerts.openvoiceos", page: "Timer" }, IDLE_NS), true);
  assert.equal(isContentPage({ namespace: "some.skill", page: "SYSTEM_TextFrame" }, IDLE_NS), true);
});

test("thinking over idle, a page arrives, speaking: the face shrinks without touching visibility or fade timing", () => {
  const { attention, timers, shown, compact } = setup();
  attention.setCompact(false);
  attention.handle("recognizer_loop:utterance");
  assert.ok(shown() && !compact());
  attention.setCompact(true);
  assert.ok(shown() && compact());
  attention.handle("recognizer_loop:audio_output_start");
  attention.setCompact(false);
  assert.ok(shown() && !compact() && attention.mode === "speaking");
  attention.setCompact(true);
  attention.handle("recognizer_loop:audio_output_end");
  timers.advance(FADE_AFTER_AUDIO_MS - 1);
  assert.ok(shown() && compact());
  timers.advance(1);
  assert.ok(!shown() && compact());
});
