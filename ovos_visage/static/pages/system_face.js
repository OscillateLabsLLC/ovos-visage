// SYSTEM_Face (SPEC 8.2): the concept face; eyes closed while session key `sleeping` is true.
import { Face } from "../face/face.js";

let face = null;

export function render(container, data) {
  const holder = document.createElement("div");
  holder.className = "face-page";
  container.append(holder);
  face = new Face(holder);
  update(data);
}

export function update(data) {
  face.setSleeping(Boolean(data.sleeping));
}

export function destroy() {
  face?.destroy();
  face = null;
}
