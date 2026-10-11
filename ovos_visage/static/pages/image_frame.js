// SYSTEM_ImageFrame and SYSTEM_AnimatedImageFrame (SPEC 8.2): muted title, the image in a rounded frame honouring
// fill and background_color, muted caption. <img> plays GIF and WebP, so both templates share this module.
import { el } from "./widgets.js";
import { imageModel } from "./templates_model.js";

const UNAVAILABLE = "Image unavailable";
let view = null;

export function render(container, data) {
  const figure = el("figure", "image-frame");
  view = { title: el("div", "template-title"), frame: el("div", "image-box"), img: el("img"), missing: el("div", "template-hint", UNAVAILABLE), caption: el("figcaption", "template-hint") };
  view.img.alt = "";
  view.img.addEventListener("error", () => view.frame.classList.add("broken"));
  view.frame.append(view.img, view.missing);
  figure.append(view.title, view.frame, view.caption);
  container.append(figure);
  update(data);
}

export function update(data) {
  const model = imageModel(data);
  view.title.textContent = model.title;
  view.caption.textContent = model.caption;
  view.frame.style.background = model.background;
  view.img.style.objectFit = model.fit;
  view.frame.classList.toggle("broken", !model.src);
  if (model.src && view.img.getAttribute("src") !== model.src) view.img.src = model.src;
}
