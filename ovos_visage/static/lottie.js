// Plays OVOS's own Lottie files (served from the ovos-gui cache at /res/) with the vendored lottie-web svg player.
// mount() returns a handle at once: `ready` resolves true when playing, false when the file or player is missing (the
// caller then draws its fallback); destroy() is safe before, during and after loading.
const PLAYER_SRC = "/static/vendor/lottie_light.min.js";
const DIR = "/res/system/qt5/animations";
export const ANIMATIONS = { loading: `${DIR}/loading.json`, success: `${DIR}/status-success.json`, fail: `${DIR}/status-fail.json` };
export const statusAnimation = (ok) => (ok ? ANIMATIONS.success : ANIMATIONS.fail);

let playerPromise = null;
export function loadPlayer(doc = globalThis.document) {
  if (globalThis.lottie) return Promise.resolve(globalThis.lottie);
  playerPromise ??= new Promise((resolve, reject) => {
    const script = Object.assign(doc.createElement("script"), { src: PLAYER_SRC });
    script.onload = () => resolve(globalThis.lottie);
    script.onerror = () => reject(new Error(`could not load ${PLAYER_SRC}`));
    doc.head.append(script);
  });
  return playerPromise;
}

/** End of a one-shot segment: the last frame with a live layer. OVOS's status-fail.json runs five frames past its
 *  layers (op 45, every layer op 40), an empty outro for looping that would otherwise be the frame we hold. */
export function liveSegment(data) {
  const layerEnd = Math.max(data.ip, ...(data.layers ?? []).map((layer) => layer.op ?? data.op));
  return [data.ip, Math.min(data.op, layerEnd)];
}

async function start(handle, el, url, loop, { player, fetcher }) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const [animationData, lottie] = await Promise.all([response.json(), player()]);
  if (handle.destroyed) return false;
  const options = { container: el, renderer: "svg", loop, autoplay: true, animationData };
  // A one-shot stops on its segment's last frame and holds it.
  handle.animation = lottie.loadAnimation(loop ? options : { ...options, initialSegment: liveSegment(animationData) });
  return true;
}

export function mount(el, url, { loop = true, player = loadPlayer, fetcher = (u) => fetch(u) } = {}) {
  const handle = { animation: null, destroyed: false };
  handle.destroy = () => {
    handle.destroyed = true;
    handle.animation?.destroy();
    handle.animation = null;
  };
  handle.ready = start(handle, el, url, loop, { player, fetcher }).catch((err) => {
    console.warn("lottie fallback:", err.message);
    return false;
  });
  return handle;
}
