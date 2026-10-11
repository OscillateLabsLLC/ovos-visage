import assert from "node:assert/strict";
import { test } from "node:test";
import { alarmGrid, alarmsModel, nextToFire, listModel, parseDelta, timerFraction, timerModel, timerTone } from "../../ovos_visage/static/pages/alerts_model.js";

test("parseDelta reads every nice_duration(speech=False) shape measured on this install", () => {
  const cases = { "0:05": 5, "0:45": 45, "1:00": 60, "1:42": 102, "10:00": 600, "59:59": 3599, "1:00:00": 3600, "1:02:05": 3725, "1d 0:00:05": 86405, "-3:49": 229 };
  for (const [text, seconds] of Object.entries(cases)) assert.equal(parseDelta(text), seconds, text);
  assert.equal(parseDelta("soon"), null);
  assert.equal(parseDelta(undefined), null);
});

test("stuck percentRemaining falls back to timeDelta over the longest delta seen", () => {
  const longest = new Map();
  const tick = (timeDelta) => timerFraction({ alertId: "a", percentRemaining: 0.99999, timeDelta, expired: false }, longest);
  assert.equal(tick("2:00"), 1);
  assert.equal(tick("1:30"), 0.75);
  assert.equal(tick("0:00"), 0);
});

test("a real percentRemaining is trusted, expired is a full ring", () => {
  assert.equal(timerFraction({ alertId: "a", percentRemaining: 0.4, timeDelta: "0:10" }, new Map()), 0.4);
  assert.equal(timerFraction({ alertId: "a", percentRemaining: 0, timeDelta: "-0:05", expired: true }, new Map()), 1);
  assert.equal(timerFraction({ alertId: "a", percentRemaining: "x", timeDelta: "later" }, new Map()), 0);
});

test("timer model sizes the stack and marks overrun", () => {
  const timer = (id, expired) => ({ alertId: id, timerName: "", timeDelta: expired ? "-0:07" : "2:15", percentRemaining: 0.99999, expired });
  const one = timerModel({ activeTimers: { timers: [timer("a", false)] } });
  const two = timerModel({ activeTimers: { timers: [timer("a", true), timer("b", false)] } });
  assert.equal(one.size, 300);
  assert.equal(two.size, 230);
  assert.deepEqual(two.timers[0], { id: "a", name: "Timer", delta: "+0:07", fraction: 1, expired: true, tone: "done" });
  assert.deepEqual(timerModel({}).timers, []);
});

test("alarms model keeps time, am/pm, name, repeat and expiry", () => {
  const [alarm] = alarmsModel({
    activeAlarms: [{ alarmIndex: "x", alarmTime: "7:00", alarmAmPm: "AM", alarmName: "", alarmRepeatStr: "Weekdays", alarmExpired: true }],
  });
  assert.deepEqual(alarm, { id: "x", time: "7:00", ampm: "AM", name: "Alarm", repeat: "Weekdays", expired: true });
  assert.deepEqual(alarmsModel({ activeAlarms: null }), []);
});

test("list model uses the skill's {main, secondary} items (_display_list)", () => {
  const model = listModel({ header: "Reminders", items: [{ main: "stretch", secondary: "11:00 PM" }, { main: "water" }, "plain"] });
  assert.equal(model.header, "Reminders");
  assert.deepEqual(model.items, [
    { main: "stretch", secondary: "11:00 PM" },
    { main: "water", secondary: "" },
    { main: "plain", secondary: "" },
  ]);
  assert.deepEqual(listModel({}).items, []);
});

test("the ring warms over the final stretch and is done when expired", () => {
  assert.deepEqual([1, 0.31, 0.3, 0.11, 0.1, 0].map((f) => timerTone(f, false)), ["calm", "calm", "warm", "warm", "hot", "hot"]);
  assert.equal(timerTone(0.9, true), "done");
  const longest = new Map([["a", 100]]);
  const tones = ["1:40", "0:25", "0:05"].map((timeDelta) => timerModel({ activeTimers: { timers: [{ alertId: "a", timeDelta, percentRemaining: 0.99999 }] } }, longest).timers[0].tone);
  assert.deepEqual(tones, ["calm", "warm", "hot"]);
});

test("the alarm grid shows up to four circles, else three and a +n more, and marks the next to fire", () => {
  const alarms = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i), expired: false }));
  assert.deepEqual([3, 4].map((n) => alarmGrid(alarms(n)).more), [0, 0]);
  assert.equal(alarmGrid(alarms(4)).shown.length, 4);
  const six = alarmGrid(alarms(6));
  assert.deepEqual([six.shown.length, six.more, six.next], [3, 3, "0"]);
});

test("the next to fire is the first pending alarm, and nothing is next while one is ringing", () => {
  assert.equal(nextToFire([{ id: "a", expired: false }, { id: "b", expired: false }]), "a");
  assert.equal(nextToFire([{ id: "a", expired: false }, { id: "b", expired: true }]), null);
  assert.equal(alarmGrid([{ id: "a", expired: true }, { id: "b", expired: false }, { id: "c", expired: false }]).next, null);
  assert.equal(nextToFire([]), null);
});
