// View models for ovos-skill-alerts pages (SPEC 8.5), built from session data exactly as the skill sends it
// (ovos_skill_alerts/util/ui_models.py build_timer_data / build_alarm_data, __init__.py _display_list). Pure; tested under node.

// Four rings plus gaps must fit above the compact-face strip (face.css --attention-strip, 118 px): 4 * 140 + 3 * 22 = 626 <= 800 - 32 - 118.
const TIMER_SIZES = [300, 230, 180, 140];
// alerts 0.12.36a2 sends percentRemaining ~0.99999 for the whole timer (no start_time in the alert context),
// so a value this close to 1 is treated as missing and progress comes from timeDelta instead.
const STUCK_PERCENT = 0.999;
const SECONDS = { d: 86400, h: 3600, m: 60, s: 1 };

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/** Seconds in a nice_duration(speech=False) string: "0:45", "1:42", "1:02:05", "1d 0:00:05"; sign ignored. */
export function parseDelta(text) {
  const match = /^-?(?:(\d+)d\s+)?(\d+(?::\d{1,2}){0,2})$/.exec(String(text ?? "").trim());
  if (!match) return null;
  const parts = match[2].split(":").map(Number);
  const [h, m, s] = [0, 0, 0, ...parts].slice(-3);
  return Number(match[1] ?? 0) * SECONDS.d + h * SECONDS.h + m * SECONDS.m + s;
}

/** Remaining fraction. `longest` maps alertId to the largest remaining time seen; it is updated here. */
export function timerFraction(timer, longest) {
  if (timer.expired) return 1;
  const percent = Number(timer.percentRemaining);
  if (Number.isFinite(percent) && percent < STUCK_PERCENT) return clamp01(percent);
  const seconds = parseDelta(timer.timeDelta);
  if (seconds === null) return clamp01(percent);
  const total = Math.max(longest.get(String(timer.alertId)) ?? 0, seconds);
  longest.set(String(timer.alertId), total);
  return total > 0 ? seconds / total : 0;
}

// Thresholds for the ring warming over the final stretch: accent, then --sun, then --bad.
const WARM_BELOW = 0.3;
const HOT_BELOW = 0.1;

/** "calm" | "warm" | "hot" | "done": the ring and glow colour for a timer at this fraction remaining. */
export function timerTone(fraction, expired) {
  if (expired) return "done";
  if (fraction <= HOT_BELOW) return "hot";
  return fraction <= WARM_BELOW ? "warm" : "calm";
}

export function timerModel(data, longest = new Map()) {
  const timers = data?.activeTimers?.timers ?? [];
  const size = TIMER_SIZES[Math.min(timers.length, TIMER_SIZES.length) - 1] ?? TIMER_SIZES[0];
  return { size, timers: timers.map((timer) => timerView(timer, longest)) };
}

function timerView(timer, longest) {
  const expired = Boolean(timer.expired);
  const fraction = timerFraction(timer, longest);
  return {
    id: String(timer.alertId),
    name: timer.timerName || "Timer",
    delta: expired ? String(timer.timeDelta ?? "").replace(/^-/, "+") : String(timer.timeDelta ?? ""),
    fraction,
    expired,
    tone: timerTone(fraction, expired),
  };
}

export function alarmsModel(data) {
  const alarms = Array.isArray(data?.activeAlarms) ? data.activeAlarms : [];
  return alarms.map((alarm) => ({
    id: String(alarm.alarmIndex),
    time: String(alarm.alarmTime ?? ""),
    ampm: String(alarm.alarmAmPm ?? ""),
    name: alarm.alarmName || "Alarm",
    repeat: String(alarm.alarmRepeatStr ?? ""),
    expired: Boolean(alarm.alarmExpired),
  }));
}

/**
 * The alarm that gets the quiet "next" glow: the first pending one, since the skill sends pending alarms sorted by
 * next expiration (alert_manager.sort_alerts_list). None while any alarm is ringing (expired = going off now:
 * _alert_expired plays the sound and holds the page with override_idle until stop, snooze or the timeout).
 */
export function nextToFire(alarms) {
  if (alarms.some((alarm) => alarm.expired)) return null;
  return alarms[0]?.id ?? null;
}

/** The alarm circles that fit the grid: all of them up to `max`, else max - 1 plus a "+n more" count. */
export function alarmGrid(alarms, max = 4) {
  const next = nextToFire(alarms);
  if (alarms.length <= max) return { shown: alarms, more: 0, next };
  return { shown: alarms.slice(0, max - 1), more: alarms.length - (max - 1), next };
}

export function listModel(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    header: String(data?.header ?? ""),
    items: items.map((item) => (typeof item === "object" ? { main: String(item.main ?? ""), secondary: String(item.secondary ?? "") } : { main: String(item), secondary: "" })),
  };
}
