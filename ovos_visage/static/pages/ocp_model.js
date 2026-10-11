// View model for the OCP now-playing page (SPEC 8.6), from ovos.common_play session data as ovos_plugin_common_play
// ocp/gui.py sends it. Pure; tested under node.
//
// Units, measured (SPEC 8.6): `duration` is the track's own length in ms (0 for a live stream). `position`
// is mpv `time-pos` in seconds, about every 2 s, except after an OCP seek, which writes ms. `length` is mpv duration in
// ms, which on a live stream is the growing buffer, so it is never used as the total. `image` can be a raw filesystem
// path outside the ovos-gui cache; the middle layer serves those it saw in session data as /res-abs/<token> (resources.py),
// so data:, http(s), /res/ and /res-abs/ URLs count as cover art and any raw path left over gets the glyph.

export const SYNC_PLAYER = "OVOSSyncPlayer";
const STATES = { playing: "playing", paused: "paused", stopped: "stopped" };
const LOADABLE = /^(data:|https?:\/\/|\/res\/|\/res-abs\/)/;
const MS = { hour: 3600000, minute: 60000, second: 1000 };

const pad2 = (n) => String(n).padStart(2, "0");

export function playbackState(status) {
  return STATES[String(status ?? "").toLowerCase()] ?? STATES.stopped;
}

export function coverUrl(image) {
  const url = String(image ?? "");
  return LOADABLE.test(url) ? url : null;
}

export function formatTime(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / MS.second) || 0);
  const [h, m, s] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

const OVERSHOOT = 1.05;
// Two reports ~2 s apart on a live stream: length and position each grow by ~2000 ms; allow mpv's jitter.
const TRACKING_SLACK_MS = 1500;

/** Position in ms: seconds unless reading it as seconds would put it past the end of a finite track. */
export function positionMs(position, totalMs) {
  const value = Number(position);
  if (!(value > 0)) return 0;
  return totalMs > 0 && value * MS.second > totalMs * OVERSHOOT ? value : value * MS.second;
}

/** The buffer `length` growing in step with `position` marks a live stream even when a duration is claimed. */
function lengthTracksPosition(previous, lengthMs, position) {
  if (!previous || !(previous.lengthMs > 0) || !(lengthMs > previous.lengthMs) || !(position > previous.positionMs)) return false;
  return Math.abs(lengthMs - previous.lengthMs - (position - previous.positionMs)) < TRACKING_SLACK_MS;
}

/** Everything the page shows except the clock-driven position, which progressAt() adds. `previous` is the last model. */
export function trackModel(data = {}, previous = null) {
  const duration = Math.max(0, Number(data.duration) || 0);
  const lengthMs = Math.max(0, Number(data.length) || 0);
  const position = positionMs(data.position, duration);
  const id = [data.uri, data.title, duration].join("|");
  const live = duration === 0 || lengthTracksPosition(previous?.id === id ? previous : null, lengthMs, position);
  return {
    id,
    title: String(data.title || "Unknown track"),
    artist: String(data.artist ?? ""),
    cover: coverUrl(data.image),
    state: playbackState(data.status),
    durationMs: live ? 0 : duration,
    lengthMs,
    positionMs: position,
    live,
    canPrev: Boolean(data.canPrev),
    canNext: Boolean(data.canNext),
    repeat: data.loopStatus === "Repeat" || data.loopStatus === "RepeatTrack",
    shuffle: data.shuffleStatus === true,
  };
}

/** Position `sinceUpdateMs` after the last update: it advances only while playing and stops at the end. */
export function progressAt(track, sinceUpdateMs = 0) {
  const advance = track.state === STATES.playing ? Math.max(0, sinceUpdateMs) : 0;
  const position = track.live ? track.positionMs + advance : Math.min(track.durationMs, track.positionMs + advance);
  return {
    positionMs: position,
    fraction: track.live ? 1 : position / track.durationMs,
    elapsed: formatTime(position),
    total: track.live ? "live" : formatTime(track.durationMs),
  };
}

function restarts(previous, track) {
  return !previous || track.id !== previous.id || track.state === STATES.stopped || track.positionMs !== previous.reportedMs;
}

/**
 * Where the position clock stands after an update at `nowMs`. A new track, a stop or a new reported position restarts
 * it at the reported position; any other update (pause, resume, unrelated keys) carries the running estimate forward,
 * so pausing freezes it in place.
 */
export function anchorFor(previous, track, nowMs) {
  if (restarts(previous, track)) {
    // OCP leaves the old track's position in place when the track changes; until mpv reports, the new one starts at 0.
    const stale = previous && track.id !== previous.id && track.positionMs === previous.reportedMs;
    const start = stale ? 0 : track.positionMs;
    return { id: track.id, positionMs: start, reportedMs: track.positionMs, state: track.state, at: nowMs };
  }
  const running = progressAt({ ...track, positionMs: previous.positionMs, state: previous.state }, nowMs - previous.at);
  return { id: track.id, positionMs: running.positionMs, reportedMs: previous.reportedMs, state: track.state, at: nowMs };
}

/** The pieces of the status line: state word, time text, whether to show the live dot, and the capability flags. */
export function statusParts(track, progress) {
  const flags = [track.canPrev && "⏮", track.canNext && "⏭", track.repeat && "repeat", track.shuffle && "shuffle"];
  return {
    state: track.state,
    time: track.live ? progress.elapsed : `${progress.elapsed} / ${progress.total}`,
    live: track.live,
    flags: flags.filter(Boolean),
  };
}

/** The upright angle a paused record eases to from `degrees`: back to 0 in the first half turn, on to 360 in the second. */
export function uprightTarget(degrees) {
  const angle = ((Number(degrees) % 360) + 360) % 360;
  return angle < 180 ? 0 : 360;
}

export function isSyncPlayer(data = {}) {
  return (data.playerBackend ?? SYNC_PLAYER) === SYNC_PLAYER;
}
