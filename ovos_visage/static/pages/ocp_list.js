// ovos.common_play / SuggestionsView and Home (SPEC 8.6). Rows: a round thumbnail with the title and source beside it,
// the playing entry ringed in the accent. Home's skills: gradient chips with the skill icon inside, the name beneath.
// No cards; every surface is a circle or plain text on black. Items rise in one after another (ocp.css .ocp-enter).
import { homeModel, suggestionsModel } from "./ocp_browse_model.js";
import { el } from "./widgets.js";

const MODELS = { Home: homeModel, SuggestionsView: suggestionsModel };
const VINYL = "/static/icons/vinyl.svg";
let view = null;

function thumb(cover, className) {
  const image = el("img", className);
  image.alt = "";
  image.src = cover ?? VINYL;
  image.classList.toggle("vinyl", !cover);
  image.addEventListener("error", () => Object.assign(image, { src: VINYL, className: `${className} vinyl` }), { once: true });
  return image;
}

function enter(node, index) {
  node.classList.add("ocp-enter");
  node.style.setProperty("--i", index);
  return node;
}

function row(entry, index) {
  const item = enter(el("li", entry.current ? "ocp-row current" : "ocp-row"), index);
  if (entry.section) item.dataset.section = entry.section;
  const text = el("div", "ocp-row-text");
  text.append(el("div", "ocp-row-title", entry.title));
  if (entry.subtitle) text.append(el("div", "ocp-row-sub", entry.subtitle));
  item.append(thumb(entry.cover, "ocp-thumb"), text);
  return item;
}

function chip(skill, index) {
  const item = enter(el("li", "ocp-skill"), index);
  const disc = el("div", "circle ocp-skill-disc");
  disc.style.setProperty("--hue", skill.hue);
  disc.append(thumb(skill.cover, "ocp-skill-icon"));
  item.append(disc, el("div", "ocp-skill-name", skill.title));
  if (skill.subtitle) item.append(el("div", "ocp-skill-types", skill.subtitle));
  return item;
}

export function render(container, data, ctx) {
  view = { heading: el("div", "ocp-heading"), list: el("ol", "ocp-list"), more: el("div", "ocp-more"), empty: el("div", "ocp-empty") };
  container.append(view.heading, view.list, view.more, view.empty);
  update(data, ctx);
}

export function update(data, ctx) {
  const model = (MODELS[ctx.page] ?? suggestionsModel)(data);
  const chips = model.layout === "chips";
  view.heading.textContent = model.heading;
  // OCP sets unrelated keys often; rebuild (and replay the rise-in) only when the rows themselves change.
  const signature = JSON.stringify([model.layout, model.rows]);
  if (signature !== view.signature) {
    view.signature = signature;
    view.list.className = chips ? "ocp-list ocp-skills" : "ocp-list";
    view.list.replaceChildren(...model.rows.map(chips ? chip : row));
  }
  view.more.textContent = model.hidden > 0 ? `+${model.hidden} more` : "";
  view.empty.textContent = model.rows.length ? "" : "Nothing here yet";
}
