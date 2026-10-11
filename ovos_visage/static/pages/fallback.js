// Any (namespace, page) without a component: namespace, page name and a dump of the session data (SPEC 8.7).
let root = null;

function describe(value) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 1);
}

export function render(container, data, ctx) {
  root = document.createElement("div");
  root.className = "fallback";
  const title = document.createElement("h2");
  title.textContent = ctx.page;
  const ns = document.createElement("div");
  ns.className = "ns";
  ns.textContent = ctx.namespace;
  root.append(title, ns, document.createElement("dl"));
  container.append(root);
  update(data);
}

export function update(data) {
  const list = root.querySelector("dl");
  list.replaceChildren();
  for (const [key, value] of Object.entries(data).sort(([a], [b]) => a.localeCompare(b))) {
    const term = document.createElement("dt");
    term.textContent = key;
    const detail = document.createElement("dd");
    detail.textContent = describe(value);
    list.append(term, detail);
  }
}
