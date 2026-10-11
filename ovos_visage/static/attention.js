// Attention overlay: the face appears over the current page while OVOS listens, thinks and speaks (SPEC 5.3 events),
// and fades out about a second after audio output ends.
export const FADE_AFTER_AUDIO_MS = 1000;
export const QUIET_AFTER_HANDLED_MS = 4000;
export const STUCK_MS = 20000;
const VISEME_EVENT = "enclosure.mouth.viseme_list";
const FACE_PAGE = "SYSTEM_Face";
const IDLE_PAGE = "idle";

/** A page with content gets the compact badge face; idle, SYSTEM_Face and the blank screen get the full face. */
export function isContentPage(target, idleNamespace) {
  if (!target?.page) return false;
  if (target.page === FACE_PAGE) return false;
  return !(target.namespace === idleNamespace && target.page === IDLE_PAGE);
}

const LISTEN_START = ["recognizer_loop:wakeword", "recognizer_loop:record_begin", "ovos.listener.record.started"];
const LISTEN_END = ["recognizer_loop:record_end", "ovos.listener.record.ended"];
const THINK_START = ["recognizer_loop:utterance", "mycroft.skill.handler.start"];
const THINK_END = ["mycroft.skill.handler.complete", "ovos.utterance.handled", "complete_intent_failure", "speak"];

export class Attention {
  constructor(element, face, timers = globalThis) {
    this.element = element;
    this.face = face;
    this.timers = timers;
    this.mode = "rest";
    this.shown = false;
    this.compact = false;
    this.hideTimer = null;
  }

  /** Badge over a content page or full face over idle; CSS animates the switch and it never touches show/hide timing. */
  setCompact(compact) {
    this.compact = Boolean(compact);
    this.element.classList.toggle("compact", this.compact);
  }

  handle(eventName, data = {}) {
    if (LISTEN_START.includes(eventName)) {
      this.show("listening");
      this.face.widen();
    } else if (LISTEN_END.includes(eventName) && this.mode === "listening") this.show("thinking");
    else if (THINK_START.includes(eventName) && this.mode !== "speaking") this.show("thinking");
    else if (THINK_END.includes(eventName) && this.mode === "thinking") this.settle(QUIET_AFTER_HANDLED_MS);
    else if (eventName === "recognizer_loop:audio_output_start") this.show("speaking");
    else if (eventName === "recognizer_loop:audio_output_end") this.settle(FADE_AFTER_AUDIO_MS);
    else if (eventName === VISEME_EVENT && this.shown) this.face.playVisemes(data.visemes);
  }

  show(mode) {
    this.setMode(mode);
    this.shown = true;
    this.element.classList.toggle("shown", true);
    this.cancelHide();
    if (mode === "listening" || mode === "thinking") this.hideAfter(STUCK_MS);
  }

  settle(hideMs) {
    this.setMode("rest");
    this.cancelHide();
    this.hideAfter(hideMs);
  }

  hide() {
    this.shown = false;
    this.element.classList.toggle("shown", false);
    this.setMode("rest");
  }

  setMode(mode) {
    this.mode = mode;
    this.element.dataset.state = mode;
    this.face.setMode(mode);
  }

  hideAfter(ms) {
    this.hideTimer = this.timers.setTimeout(() => this.hide(), ms);
  }

  cancelHide() {
    this.timers.clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }
}
