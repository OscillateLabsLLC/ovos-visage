// View models for the SYSTEM_* templates (SPEC 8.2). Keys are those GUIInterface.show_* sets in ovos_bus_client/apis/gui.py.
// Every model tolerates null or missing keys, since skills often leave title, caption and labels unset.
// Pure; tested under node.

export const READING_WPM = 180;
const MIN_PAGE_MS = 4000;
const FILL_TO_OBJECT_FIT = { fit: "contain", crop: "cover", stretch: "fill" };
const SAFE_IMAGE = /^(data:image\/|https?:\/\/|\/res\/)/i;
const SAFE_URL = /^https?:\/\//i;

const text = (value) => (value === null || value === undefined ? "" : String(value));

export function textFrameModel(data) {
  return { title: text(data?.title), text: text(data?.text) };
}

/** How long a page of `words` words stays up at reading pace, never shorter than MIN_PAGE_MS. */
export function pageDurationMs(words, wpm = READING_WPM) {
  return Math.max(MIN_PAGE_MS, Math.round((words / wpm) * 60000));
}

/** Split text into pages greedily: each page holds as many words as `fits(candidate)` accepts (at least one). */
export function paginate(fullText, fits) {
  const words = text(fullText).split(/\s+/).filter(Boolean);
  const pages = [];
  let current = [];
  for (const word of words) {
    const candidate = [...current, word];
    if (current.length && !fits(candidate.join(" "))) {
      pages.push(current.join(" "));
      current = [word];
    } else {
      current = candidate;
    }
  }
  if (current.length) pages.push(current.join(" "));
  return pages;
}

// Short answers sit in a ring chip; one line of light type, as big as fits its inner width.
export const SHORT_TEXT_CHARS = 24;
const CHAR_WIDTH_EM = 0.56;
const MAX_SHORT_PX = 72;

export function isShortText(text) {
  return text.length > 0 && text.length <= SHORT_TEXT_CHARS;
}

// Short answers: one line while it can stay at least WRAP_BELOW_PX, else two lines; never below MIN_SHORT_PX.
const WRAP_BELOW_PX = 48;
const MIN_SHORT_PX = 40;
const BREAK_AFTER = /[\s.,:;/-]/;

function fitPx(longestLine, innerPx) {
  return Math.min(MAX_SHORT_PX, Math.floor(innerPx / (Math.max(longestLine, 1) * CHAR_WIDTH_EM)));
}

/** The two-line split that best balances the halves (ties keep the heavier top line), breaking after a space or punctuation; null if none. */
export function splitShort(text) {
  let best = null;
  for (let i = 1; i < text.length; i += 1) {
    if (!BREAK_AFTER.test(text[i - 1])) continue;
    const lines = [text.slice(0, i).trimEnd(), text.slice(i).trimStart()];
    if (lines.some((line) => !line)) continue;
    const longest = Math.max(...lines.map((line) => line.length));
    if (!best || longest <= best.longest) best = { lines, longest };
  }
  return best?.lines ?? null;
}

/** Lines and font size (px) for a short answer inside `innerPx`. */
export function shortLayout(text, innerPx) {
  const onePx = fitPx(text.length, innerPx);
  const split = onePx < WRAP_BELOW_PX ? splitShort(text) : null;
  if (!split) return { lines: [text], px: Math.max(MIN_SHORT_PX, onePx) };
  const twoPx = fitPx(Math.max(...split.map((line) => line.length)), innerPx);
  return twoPx > onePx ? { lines: split, px: Math.max(MIN_SHORT_PX, twoPx) } : { lines: [text], px: Math.max(MIN_SHORT_PX, onePx) };
}

export function loadingModel(data) {
  return { label: text(data?.label) };
}

/** GUIInterface.show_status_animation sends "Enabled" / "Disabled"; the QML does a string compare. */
export function statusModel(data) {
  return { ok: data?.status === "Enabled", label: text(data?.label) };
}

/** data:, http(s) and cache paths rewritten to /res/ are loadable; anything else (a bare producer path) is not. */
export function imageSource(value) {
  const src = text(value).trim();
  return SAFE_IMAGE.test(src) ? src : null;
}

export function imageModel(data) {
  return {
    src: imageSource(data?.image),
    fit: FILL_TO_OBJECT_FIT[text(data?.fill).toLowerCase()] ?? FILL_TO_OBJECT_FIT.fit,
    background: text(data?.background_color) || "transparent",
    title: text(data?.title),
    caption: text(data?.caption),
  };
}

export function htmlModel(data) {
  const base = text(data?.resourceLocation).trim();
  return { html: text(data?.html), base: SAFE_URL.test(base) || base.startsWith("/res/") ? base : "" };
}

/** srcdoc with a <base> for relative resources when the skill gave a usable resourceLocation. */
export function htmlSrcdoc(model) {
  if (!model.base) return model.html;
  const baseTag = `<base href="${model.base.replace(/"/g, "&quot;")}">`;
  return /<head[^>]*>/i.test(model.html) ? model.html.replace(/<head[^>]*>/i, (head) => head + baseTag) : baseTag + model.html;
}

export function urlModel(data) {
  const url = text(data?.url).trim();
  return { url, frameable: SAFE_URL.test(url) };
}

export function inputBoxModel(data) {
  return {
    title: text(data?.title),
    placeholder: text(data?.placeholder),
    confirm: text(data?.confirm_text),
    exit: text(data?.exit_text),
  };
}
