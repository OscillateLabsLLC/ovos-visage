// (namespace, page) -> page module, keyed by exact name so adding a template is one entry and one module (SPEC 8.2).
export const BLANK = { namespace: "", page: "", index: 0 };

const ROUTES = {
  "ovos-skill-homescreen.openvoiceos/idle": "./pages/idle.js",
  "ovos-skill-date-time.openvoiceos/time": "./pages/time.js",
  "ovos-skill-date-time.openvoiceos/date": "./pages/date.js",
  "ovos-skill-weather.openvoiceos/CurrentWeather": "./pages/weather_now.js",
  "ovos-skill-weather.openvoiceos/SingleDay": "./pages/weather_now.js",
  "ovos-skill-weather.openvoiceos/DailyForecast": "./pages/forecast.js",
  "ovos-skill-weather.openvoiceos/HourlyForecast": "./pages/forecast.js",
  "ovos-skill-weather.openvoiceos/SunriseSunset": "./pages/sun_times.js",
  "ovos-skill-alerts.openvoiceos/Timer": "./pages/timer.js",
  "ovos-skill-alerts.openvoiceos/AlarmsOverviewCard": "./pages/alarms.js",
  "ovos-skill-alerts.openvoiceos/ListView": "./pages/alert_list.js",
  // OCP shows PlayerLoader and names the player in playerBackend; the page renders OVOSSyncPlayer, else the fallback.
  "ovos.common_play/PlayerLoader": "./pages/now_playing.js",
  "ovos.common_play/OVOSSyncPlayer": "./pages/now_playing.js",
  "ovos.common_play/busy": "./pages/ocp_busy.js",
  "ovos.common_play/SuggestionsView": "./pages/ocp_list.js",
  "ovos.common_play/Home": "./pages/ocp_list.js",
};
// System templates are shown in the calling skill's own namespace, so they route by page name alone.
const TEMPLATES = {
  SYSTEM_Face: "./pages/system_face.js",
  SYSTEM_TextFrame: "./pages/text_frame.js",
  SYSTEM_Loading: "./pages/loading.js",
  SYSTEM_Status: "./pages/status.js",
  SYSTEM_ImageFrame: "./pages/image_frame.js",
  SYSTEM_AnimatedImageFrame: "./pages/image_frame.js",
  SYSTEM_HtmlFrame: "./pages/html_frame.js",
  SYSTEM_UrlFrame: "./pages/url_frame.js",
  SYSTEM_InputBox: "./pages/input_box.js",
};
const BLANK_MODULE = "./pages/blank.js";
const FALLBACK_MODULE = "./pages/fallback.js";

export function modulePath(target) {
  if (target === BLANK) return BLANK_MODULE;
  return ROUTES[`${target.namespace}/${target.page}`] ?? TEMPLATES[target.page] ?? FALLBACK_MODULE;
}

export class Router {
  constructor(container, onFocus) {
    this.container = container;
    this.onFocus = onFocus;
    this.shownKey = null;
    this.module = null;
    this.generation = 0;
  }

  async show(target, data, ctx) {
    const key = `${target.namespace}/${target.page}/${target.index}`;
    if (key === this.shownKey) {
      this.module?.update(data, ctx);
      return;
    }
    this.shownKey = key;
    const generation = ++this.generation;
    const module = await import(modulePath(target));
    if (generation !== this.generation) return;
    this.module?.destroy?.();
    this.module = module;
    this.container.replaceChildren();
    module.render(this.container, data, ctx);
    if (target !== BLANK) this.onFocus(target.namespace, target.index);
  }

  reset() {
    this.shownKey = null;
  }
}
