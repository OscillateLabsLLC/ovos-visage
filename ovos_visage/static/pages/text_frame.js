// SYSTEM_TextFrame (SPEC 8.2, SPEC 9): short answers in a glowing ring chip like the clock, title small above; long
// text as large centred lines split into pages that fit the frame, stepped at reading pace, with page dots.
import { el, glow, ring } from "./widgets.js";
import { isShortText, pageDurationMs, paginate, shortLayout, textFrameModel } from "./templates_model.js";

// Room for long text: the frame minus the title, the page dots and the gaps between them.
const DOTS_PX = 20;
const GAPS_PX = 36;
// The chip is 300 px; its text must stay inside the ring (about 84 % of the diameter).
const CHIP_INNER_PX = 252;
let view = null;
let timer = null;

function fitsIn(body, limit) {
  return (candidate) => {
    body.textContent = candidate;
    return body.scrollHeight <= limit;
  };
}

function showPage(index) {
  const { pages, body, dots } = view;
  body.textContent = pages[index] ?? "";
  dots.replaceChildren(...(pages.length > 1 ? pages.map((_, i) => el("span", i === index ? "active" : "")) : []));
  clearTimeout(timer);
  if (pages.length > 1) timer = setTimeout(() => showPage((index + 1) % pages.length), pageDurationMs(body.textContent.split(/\s+/).length));
}

function showShort(text) {
  const chip = el("div", "circle text-chip gradient-fill");
  view.body.className = "text-body short";
  const { lines, px } = shortLayout(text, CHIP_INNER_PX);
  view.body.style.fontSize = `${px}px`;
  chip.append(glow(), ring(1), view.body);
  view.frame.replaceChildren(view.title, chip, view.dots);
  view.pages = [lines.join("\n")];
}

function showLong(text) {
  view.body.className = "text-body";
  view.body.style.fontSize = "";
  view.frame.replaceChildren(view.title, view.body, view.dots);
  view.pages = paginate(text, fitsIn(view.body, view.frame.clientHeight - view.title.offsetHeight - DOTS_PX - GAPS_PX));
}

export function render(container, data) {
  const frame = el("section", "text-frame stagger-enter");
  view = { frame, title: el("div", "template-title"), body: el("div", "text-body"), dots: el("div", "page-dots") };
  container.append(frame);
  update(data);
}

export function update(data) {
  const model = textFrameModel(data);
  if (view.model?.title === model.title && view.model?.text === model.text) return;
  view.model = model;
  view.title.textContent = model.title;
  if (isShortText(model.text)) showShort(model.text);
  else showLong(model.text);
  showPage(0);
}

export function destroy() {
  clearTimeout(timer);
}
