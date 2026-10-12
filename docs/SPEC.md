# ovos-visage: design and protocol reference

A browser GUI client for OpenVoiceOS that realises the screen shown in the 2018 Mycroft
Mark II Kickstarter concept: a tall portrait display with big circular widgets, a face,
and animated listen/think/speak states. Mycroft never shipped this design. This is a new
thing built on that concept, not an emulator of any hardware.

Facts marked **measured** were observed on a running OVOS install with the versions in
section 3. Facts marked **assumed** were not measured. Re-measure anything that matters
before building on it, especially against newer OVOS releases.

---

## 1. Goal and non-goals

**Goal.** A client that:

1. Connects to a stock `ovos-gui` service as a GUI client. No OVOS code is modified.
2. Renders the idle screen, the system templates, and the pages of four skills (weather,
   date-time, alerts, OCP media) in the Kickstarter visual language.
3. Shows listening, thinking and speaking states with an animated face.
4. Runs in a browser, portrait, display-only.

**Non-goals.**

- Touch or click interaction beyond reporting `page_gained_focus`.
- Local-media skill pages.
- Video playback and the OCP web player.
- Wallpapers, the app drawer, skill examples, the night-time page of the homescreen.
- Any change to `ovos-gui`, `ovos-skill-homescreen`, or any skill.
- Publishing to PyPI (the release workflow exists; nothing is published).

---

## 2. Design decisions

| Decision | Choice |
|---|---|
| Seam | Connect to the `ovos-gui` websocket as a GUI client, not to the raw core bus for pages. |
| Idle screen | Run `ovos-skill-homescreen` and render its namespace. Weather and time are not re-sourced in the client. |
| Scope | System templates, weather, date-time, alerts and OCP media. Local-media is skipped. |
| Input | Display-only. |
| Orientation | Portrait. |
| Isolation | `ovos-gui` and the homescreen skill run from their own virtualenv, never the one OVOS runs from (section 3.1). |
| Stack | Python middle layer (aiohttp) plus browser rendering (vanilla HTML, CSS, SVG and JS), the same shape as `ovos-virtual-mark1`. |

---

## 3. Versions measured against

A macOS install of OVOS from ovos-installer, with OVOS in one virtualenv and `ovos-gui`
plus the homescreen skill in a second.

| Item | Value |
|---|---|
| OVOS virtualenv | Python 3.11.11; `ovos-workshop 9.8.16a1` |
| GUI virtualenv | Python 3.11, same interpreter; `ovos-gui 1.5.3a1`, `ovos-bus-client 2.11.25a1`, `ovos-config 3.8.2a1` before the homescreen install (2.3.11a2 after), `ovos-utils 0.15.4a2`, `websocket-client 1.9.2` |
| Skills | weather 1.5.3a2, alerts 0.12.36a2, date-time 1.11.8a1, homescreen 3.0.4a2, ovos-plugin-common-play 1.3.14a1, ovos-audio 2.2.8a1 with ovos-audio-plugin-mpv 0.2.1 |
| Core bus | `ws://127.0.0.1:8181/core` |
| GUI websocket | `ws://127.0.0.1:18181/gui` once `ovos-gui-service` runs |
| GUI resource cache | `~/.cache/ovos_gui/<namespace>/qt5/...` and `~/.cache/ovos_gui/system/qt5/...` |
| Effective gui config | `idle_display_skill: ovos-skill-homescreen.openvoiceos`, `extension: generic`, `generic.homescreen_supported: true` (no `gui` section in the user config; defaults apply) |

`ovos-gui-service` logs "GUI websocket started!" on success and prints the effective gui
config.

### 3.1 Homescreen skill: a separate virtualenv

`ovos-skill-homescreen 3.0.4a2` pins `ovos-workshop<9`. Installing it into the virtualenv
OVOS runs from would downgrade `ovos-workshop` (9.8.16a1 to 8.3.0a1) and `ovos-config`
(to 2.3.11a2) there and can break OVOS (measured by dry run). Run it as a standalone
process from the GUI virtualenv instead, connected to the same bus; `ovos-workshop`
ships `ovos-skill-launcher` for this:

```bash
env -u VIRTUAL_ENV -u PIP_CONSTRAINT -u UV_CONSTRAINT \
  <gui-venv>/bin/pip install --pre ovos-gui ovos-workshop ovos-skill-homescreen
<gui-venv>/bin/ovos-skill-launcher ovos-skill-homescreen.openvoiceos
```

OVOS alpha installs export `PIP_CONSTRAINT` and `UV_CONSTRAINT` (the alpha constraints,
which pin `ovos-workshop` 9.x) and may export `VIRTUAL_ENV`; unset them for this install
or resolution conflicts with the homescreen's `ovos-workshop<9`. Measured result in the
GUI virtualenv: `ovos-skill-homescreen 3.0.4a2`, `ovos-workshop 8.3.0a1`, `ovos-config`
2.3.11a2; `pip check` is clean and `ovos-gui-service` still starts. The launcher finds the
skill by id (entry point lookup), the skill loads, and it caches its GUI files under
`~/.cache/ovos_gui/ovos-skill-homescreen.openvoiceos/`.

The homescreen reads time through the date-time skill's `SkillApi` when `datetime_skill`
is set in its settings, and otherwise formats time itself from core config. Weather comes
from the weather skill over the bus. Both work across processes.

---

## 4. Architecture

```
                 core bus 8181                     GUI ws 18181
ovos-core ─────────────────────▶ ovos-gui-service ─────────────────▶ visage (Python)
skills (incl. homescreen)   gui.page.show / gui.value.set        │  GuiClient: protocol + state
                                                                  │  WidgetManager: widgets + notifications
                                 ◀───────────── ovos.widgets.* ───┤  (port of the shell companion's role)
                                                                  │  resources: ~/.cache/ovos_gui, seen images
                                                                  │  WebServer: /, /ws, /static, /res, /res-abs
                                                                  ▼
                                                             browser (portrait)
```

Three processes besides OVOS itself: `ovos-gui-service`, `ovos-skill-launcher` for the
homescreen, and `ovos-visage`. The browser is pure rendering fed over one websocket from
`ovos-visage`.

### Why a Python middle layer

- `ovos-gui` has no file server (measured: no `StaticFileHandler` in 1.5.3a1). Skill
  images and animations live in `~/.cache/ovos_gui`, which a browser cannot read.
- The widget and notification role that `ovos-gui-plugin-shell-companion` plays is
  absent with the `generic` extension (measured: `ovos-gui` has no `ovos.widgets` or
  `ovos.notification` handlers). Somebody must play it, and it needs a core bus client.
- Reconnect, buffering and the page state machine are easier to test in Python.

### Package layout

```
ovos_visage/
  app.py            CLI, wiring, asyncio main
  bus.py            core bus client
  gui_client.py     GUI websocket protocol client + reconnect
  state.py          namespaces, pages, session data, active-skill stack
  widgets.py        WidgetManager (core bus): widgets + notifications
  resources.py      cache path rewriting and the seen-image registry
  framing.py        X-Frame-Options / CSP check for SYSTEM_UrlFrame
  web.py            aiohttp server: index, /ws, /static, /res, /res-abs, /frameable
  static/
    index.html, visage.css, visage.js   shell, shared styles, entry point
    *.css           per-area styles (skills, alerts, templates, ocp)
    mirror.js, router.js, attention.js  state mirror, page router, attention overlay
    face/           the face component, viseme shapes, comparison sheet
    pages/*.js      one module per page component, pure *_model.js view models, shared widgets.js
    icons/*.svg     self-animating icons
    lottie.js, lottie_fit.js, vendor/   OVOS Lottie playback (vendored lottie-web)
tests/              pytest, node tests (tests/js), recorded fixtures, manual drivers
docs/               this file, UPSTREAM_ISSUES.md, NOTES.md, screenshots, spike scripts
```

---

## 5. GUI protocol contract (measured against ovos-gui 1.5.3a1)

### 5.1 Connect sequence

1. Open the core bus `ws://127.0.0.1:8181/core`. Send:
   ```json
   {"type": "mycroft.gui.connected", "data": {"gui_id": "<unique>", "framework": "html"}}
   ```
2. Receive `mycroft.gui.port` on the core bus: `{"port": 18181, "gui_id": ..., "framework": "html"}`.
3. Open `ws://127.0.0.1:18181/gui`.
4. **Send the announcement again on the GUI socket**, flat wire format:
   ```json
   {"type": "mycroft.gui.connected", "gui_id": "<unique>", "framework": "html"}
   ```

Step 4 is the gotcha. The service stores the framework per GUI socket from the message
received on that socket (`ovos_gui/bus.py`, `on_message`). Without step 4 the socket
defaults to `qt5` and every page arrives with a QML path as its URL. With step 4 every
page arrives as `{"url": null, "page": "<name>"}`. Both outcomes were measured. Two
announcements make the service emit `mycroft.gui.port` twice; the second is ignored.

The GUI wire format is flat: fields sit at the top level next to `type`, not under
`data`. The core bus format is the usual `type`/`data`/`context` envelope.

The core bus connection stays open after step 2: the WidgetManager needs it (7.2).

### 5.2 Messages received on the GUI socket

All measured. Namespace is a skill id, or `system`, or `mycroft.system.active_skills`.

| type | fields | meaning |
|---|---|---|
| `mycroft.session.list.insert` | `namespace: "mycroft.system.active_skills"`, `position`, `data: [{"skill_id": ...}]` | active skill stack changed |
| `mycroft.session.list.remove` | `namespace: "mycroft.system.active_skills"`, `position`, `items_number` | skill left the stack |
| `mycroft.session.set` | `namespace`, `data: {key: value, ...}` | merge into that namespace's session data (one key per message in practice) |
| `mycroft.session.delete` | `namespace`, `property` | remove a key |
| `mycroft.session.list.insert/update/move/remove` | `namespace`, `property`, `position`, `values` / `from`,`to`, `items_number` | list operations on a session key. The installed skills send lists as whole values; the deltas are implemented and tested anyway |
| `mycroft.gui.list.insert` | `namespace`, `position`, `data: [{"url": null, "page": "time"}]` | pages to show for that namespace |
| `mycroft.gui.list.move` / `mycroft.gui.list.remove` | `namespace`, `from`/`to` or `position`, `items_number` | page list edits |
| `mycroft.events.triggered` | `namespace`, `event_name`, `data` | an event. `namespace: "system"` carries mirrored core bus messages (5.3). `page_gained_focus` with `data.number` asks the client to show that page index of that namespace. |

Order observed for a skill showing a page: active_skills insert, then session.set per
key, then gui.list.insert, then `page_gained_focus`. When another skill takes over, the
previous namespace's keys arrive as `session.delete` and it is removed from the active
list. ovos-gui can also move an already-active namespace to the front without a list
message when it re-shows pages (docs/UPSTREAM_ISSUES.md); the state model handles that
(section 6).

### 5.3 Core bus events mirrored to the GUI as `namespace: "system"`

From `ovos_gui/namespace.py` `_define_messages_to_forward` (measured):

- `ovos.utterance.handled`, `ovos.utterance.cancelled`, `mycroft.skill.handler.start`,
  `mycroft.skill.handler.complete`, `complete_intent_failure`
- `speak`, `recognizer_loop:audio_output_start`, `recognizer_loop:audio_output_end`
- `ovos.listener.sleep`, `recognizer_loop:wake_up`, `ovos.listener.awoken`,
  `recognizer_loop:utterance`, `recognizer_loop:wakeword`,
  `recognizer_loop:recognition_unknown`, `ovos.listener.record.started`,
  `ovos.listener.record.ended`
- every `enclosure.eyes.*` and `enclosure.mouth.*` command, `enclosure.weather.display`

So the listen/think/speak state machine needs only the GUI socket:

| state | enter on | leave on |
|---|---|---|
| listening | `ovos.listener.record.started` (or `recognizer_loop:wakeword`) | `ovos.listener.record.ended` |
| thinking | `recognizer_loop:utterance` or `mycroft.skill.handler.start` | `mycroft.skill.handler.complete`, `ovos.utterance.handled`, `complete_intent_failure`, or first `speak` |
| speaking | `recognizer_loop:audio_output_start` | `recognizer_loop:audio_output_end` |
| idle | anything else | |

`enclosure.mouth.viseme_list` carries `{"start": epoch, "visemes": [[code, t], ...]}`
during speech and drives the face's mouth, on the `SYSTEM_Face` page and on the
attention overlay. `t` is the **cumulative end time** in seconds of that code
(`ovos_bus_client` `EnclosureApi.mouth_viseme` docstring; measured lists were
monotonic): code `k` shows from the previous end until its own. Codes are strings
`"0"`-`"6"` from `ovos_utils/lang/visimes.py`. `start` is `time()` on the ovos-audio
machine, set about 3 ms after `audio_output_start`; for "what time is it" the list ends
about 1.1 s before `audio_output_end`.

**Attention face size.** The face covers and dims the screen only when the current page
is the homescreen `idle`, `SYSTEM_Face`, or the blank screen. Over any other page (a
content page) it is a compact badge: the same face scaled into a 104 px dark disc at the
bottom centre, and the page stays undimmed. Content pages reserve a 118 px bottom strip
(`--attention-strip`: the badge plus a 7 px gap above and below), so no content sits
under the badge. The size follows the current page, not the listen/think/speak state:
the usual sequence is utterance, thinking with the full face over idle, the skill page
arrives and the face shrinks to the badge in 300 ms, then speaking. If idle returns while
the face is up, it grows back. Show and fade timing do not change with the size.

### 5.4 Messages the client sends on the GUI socket

- `{"type": "mycroft.events.triggered", "namespace": ns, "event_name": "page_gained_focus", "parameters": {"number": i, "skillId": ns}}`
  after a page is rendered, once per focus change. `ovos_gui/bus.py` `on_message` reads
  `parameters` (not `data`) and takes the namespace from `parameters.skillId`; a `data`
  payload raises KeyError in the service. Measured: the service then emits
  `gui.page_gained_focus {"namespace": ns, "page_number": 0, "skill_id": ns}` on the core
  bus with `gui_framework: html`.
- Nothing else; the client is display-only.

### 5.5 Page URL resolution

`ovos_gui/page.py` `get_file_extension` returns `qml` for `qt5`/`qt6` and `""` for
anything else, so `get_uri` returns `None` for framework `html`. The client resolves
`(namespace, page)` to its own component; unknown pairs render the fallback (8.7).

---

## 6. Client state model

One `Namespace` per skill id:

```
Namespace: skill_id, pages: list[str], data: dict, focused_index: int, events: dict
State: namespaces: dict[str, Namespace], active: list[str]  # from mycroft.system.active_skills
```

Rules:

- The screen shows the focused page of the first namespace in `active` that has pages.
  If none has, it shows the idle namespace (`ovos-skill-homescreen.openvoiceos`) if it
  has a page, else a built-in blank idle (7.1). Walking `active` matters: a skill enters
  `active` at position 0 a few messages before its `gui.list.insert`, and stopping at
  `active[0]` would flash idle in that gap even with a page further down the stack
  (measured in the `*_over_timer` fixtures).
- A `gui.list.insert` for an active namespace that had no pages moves it to the front,
  matching what ovos-gui does without telling clients.
- `page_gained_focus` sets `focused_index` for that namespace.
- Session data is merged per key. Values may be nested dicts and lists; they pass
  through.
- On reconnect, clear everything, then apply what the service replays. On socket open
  `ovos_gui/bus.py` `GUIWebsocketHandler.open()` calls `synchronize()`, which sends, for
  every active namespace, `session.list.insert` on `mycroft.system.active_skills`, one
  `gui.list.insert` with all its pages, and one `session.set` per data key. This runs
  before the client's second `mycroft.gui.connected` reaches the socket, so the socket is
  still `qt5` and the replayed pages carry QML paths as `url` (for example
  `~/.cache/ovos_gui/ovos-skill-homescreen.openvoiceos/qt5/idle.qml`). Pages sent later
  arrive with `url: null`. The client routes by page name only, so the url does not
  matter. Recorded in `tests/fixtures/boot_sync_idle.jsonl`.
- The browser receives a full snapshot on `/ws` connect, then deltas in the same shapes
  as the GUI protocol. `static/mirror.js` is the same model as `state.py`; a test replays
  every fixture through both and requires identical state.

---

## 7. Behaviour the middle layer provides

### 7.1 Idle screen

The homescreen skill's `idle` page, rendered from its namespace data (8.1). When no
namespace has a page at all, a built-in blank idle shows a logo badge and the browser's
clock.

### 7.2 WidgetManager (port of `ovos-gui-plugin-shell-companion` `wigets.py`)

The alerts skill emits generic widget messages and the homescreen listens for typed
ones; the shell companion translates, and with `extension: generic` nobody does. This
port in `ovos_visage/widgets.py` does, attached to the core bus:

| hear (core bus) | emit (core bus) |
|---|---|
| `ovos.widgets.display` `{type, data}` | `ovos.widgets.<type>.display` `{"widget": data}` for type in timer, alarm; `audio` maps to `media` |
| `ovos.widgets.update` `{type, data}` | `ovos.widgets.<type>.update` `{"widget": data}` |
| `ovos.widgets.remove` `{type, data}` | `ovos.widgets.<type>.remove` |
| `ovos.notification.api.set` `{duration, sender, text, action, type, style, callback_data}` | append to an in-memory list, then `ovos.notification.update_counter` `{"notification_counter": n}`, `ovos.notification.notification_data` `{"notification": {...}}`, `ovos.notification.show` |
| `ovos.notification.api.request.storage.model` | `ovos.notification.update_storage_model` `{"notification_model": {"storedmodel": [...], "count": n}}` |
| `ovos.notification.api.pop.clear`, `...pop.clear.delete`, `...storage.clear`, `...storage.clear.item`, `...set.controlled`, `...remove.controlled` | as in the shell companion source |

A notification record is `{duration, sender, text, action, type, style, callback_data,
timestamp}`. The shell companion sleeps 2 s before emitting after `api.set`; this port
emits immediately.

The homescreen turns the typed widget messages into GUI events on its own namespace:
`ovos.timer.widget.manager.update`, `ovos.alarm.widget.manager.update`,
`ovos.media.widget.manager.update` (the last with `{"widget": ..., "state":
"playing"|"paused"|"stopped"}`). Those arrive as `mycroft.events.triggered` and drive the
idle widgets. The alerts skill's widget data is `{"count": n, "action":
"ovos.gui.show.pending.timers"}` (the same for alarms).

### 7.3 Static resources

`~/.cache/ovos_gui/` is served at `/res/`. Session values that are file paths under it
(the weather skill's `weatherCondition` is one) are rewritten to `/res/<relative path>`
before reaching state or browser. `http(s)` and `data:` values pass through. `/res/`
serves nothing outside the cache root (no traversal).

Some producers send image paths outside the cache: OCP sends skill icons, station logos
and its own `ocp.png` as absolute paths into the OVOS virtualenv. Such a value is served
only when that exact path appeared in session data, is absolute, contains no symlink and
is an existing image file (`.svg .png .jpg .jpeg .gif .webp`). The rewriter registers it
under an opaque token and rewrites it to `/res-abs/<token>`; the server maps tokens back
only through that registry (bounded) and re-checks the file when serving, so no file
path is ever read from a URL. Anything else is left as is and the page shows its own
placeholder.

Weather assets in the cache (measured): `images/{sun,clouds,rain,snow,storm,fog,
partial_clouds_day,partial_clouds_night,night,moon,wind,humidity,sunrise,sunset,
chanceprecipitation,high_temperature,low_temperature}.svg` and Lottie `animations/
{sun,night,partial_clouds,clouds,rain,sleet,snow,storm,fog}.json`.

---

## 8. Pages

Session keys below come from skill source and the QML the pages bind (measured where
recorded in `tests/fixtures`). Every page is a JS module exporting
`render(container, data, ctx)` and `update(data, ctx)`, routed by exact
`namespace/page` (system templates by page name alone), with pure view models in
`*_model.js` tested under node.

### 8.1 `ovos-skill-homescreen.openvoiceos` / `idle`

Keys: `time_string` (`"HH:MM"`), `date_string`, `weekday_string`, `day_string`,
`month_string`, `year_string`, `dateFormat` (`"DMY"` or `"MDY"`), `weather_api_enabled`,
`weather_code` (int, table below), `weather_temp`, `notification_model`
(`{storedmodel: [...], count}`, but `[]` from `handle_idle` at boot; measured),
`notifcation_counter` (sic), `system_connectivity`. Ignored: `wallpaper_path`,
`selected_wallpaper`, `applications_model`, `apps_enabled`, `skill_examples`,
`skill_info_enabled`, `skill_info_prefix`, `rtl_mode`, `persistent_menu_hint`.

Events on this namespace: `ovos.timer.widget.manager.update` `{count, action}`,
`ovos.alarm.widget.manager.update` `{count, action}`, `ovos.media.widget.manager.update`
`{widget, state}`.

`weather_code` → icon (the homescreen's own switch): 0 sun, 1 partial_clouds, 2 clouds,
3 rain, 4 rain, 5 storm, 6 snow, 7 fog.

Layout: a column of circles. Top: weather circle (icon and temperature). Middle: clock
circle (big time, small date). Below: timer circle when `count > 0`, alarm circle when
`count > 0`, media circle when `state == "playing"` (title, artist). A small
notification badge when the counter is non-zero. The homescreen pushes `time_string`
itself about once a minute, so the idle clock follows session data, not the browser
clock.

### 8.2 System templates (`system` namespace; page names from the installed QML)

| page | keys | render |
|---|---|---|
| `SYSTEM_TextFrame` | `text`, `title` (may be null or absent) | small muted title above large centred text on black; short answers in big type inside a glowing ring sized to fit; long text paginated to the frame and stepped at about 180 words per minute, with page dots |
| `SYSTEM_Face` | `sleeping` (bool) | the face (section 9); closed eyes when sleeping |
| `SYSTEM_Loading` | `label` | OVOS's own `system/qt5/animations/loading.json` Lottie (as `SYSTEM_Loading.qml` plays it) in a chip-sized circle, looping, label beneath; thinking dots in a glowing ring if the file is not cached |
| `SYSTEM_Status` | `status` (`"Enabled"` or `"Disabled"`), `label` | `status-success.json` or `status-fail.json` Lottie in a chip-sized circle, played once and held on the last frame (the QML loops it), label beneath; without the file, an accent ring with a check or a dimmed ring with a cross, blooming as it arrives |
| `SYSTEM_ImageFrame` | `image`, `title`, `caption`, `fill` (`fit`/`crop`/`stretch`), `background_color` | the image, honouring `fill` and `background_color` |
| `SYSTEM_AnimatedImageFrame` | same | same; `<img>` handles GIF and WebP |
| `SYSTEM_HtmlFrame` | `html`, `resourceLocation` | sandboxed iframe `srcdoc` (scripts run, no access to the page) |
| `SYSTEM_UrlFrame` | `url` | sandboxed iframe; many sites refuse framing. The middle layer reads the site's `X-Frame-Options` / CSP `frame-ancestors` at `/frameable/<namespace>` (only the `url` in that namespace's session data, never a browser-supplied URL); an 8 s load timeout covers the rest; a refused site shows the URL beside a turning globe |
| `SYSTEM_InputBox` | `title`, `placeholder`, `confirm_text`, `exit_text`, `skill_id_handler` | display-only: a pulsing mic chip, title and placeholder as a prompt, confirm and exit as muted hints. ovos-gui ships no QML for this template (docs/UPSTREAM_ISSUES.md) |

The `image` value may be a `data:` URI, an `http` URL, or a cache path (the producer
calls `_to_wire_image`); all three work.

`ovos-gui-api-client` (installed as a dependency, not yet used by workshop) proposes 21
lowercase templates (`SYSTEM_text`, `SYSTEM_weather`, `SYSTEM_clock`, ...). They are not
built; the router is keyed by exact name, so each would be one module.

### 8.3 `ovos-skill-weather.openvoiceos`

| page | keys |
|---|---|
| `CurrentWeather` | `weatherCode` (animated code), `currentTemperature`, `highTemperature`, `lowTemperature`, `chanceOfPrecipitation`, `windSpeed`, `humidity`, `weatherLocation`, `currentTimezone`, `weatherCondition` (image path) |
| `DailyForecast` | `forecast.all[]` each `{weatherCondition, date, highTemperature, lowTemperature}` |
| `HourlyForecast` | `hourlyForecast.hours[]` each `{weatherCondition, time, temperature, precipitation}` |
| `SingleDay` | `weatherCode`, `weatherDate`, `highTemperature`, `lowTemperature`, `chanceOfPrecipitation`, `windSpeed`, `humidity`, `weatherLocation` |
| `SunriseSunset` | `sunrise`, `sunset`, `weatherLocation`, `currentTimezone` |

`weatherCode` is the skill's **animated code**, a different table from the homescreen's
`weather_code`. `static/pages/weather_model.js` copies the `getWeatherAnimation` switch
from the skill's `WeatherDelegate.qml`: 0 sun, 1 night, 2 and 3 partial clouds, 4 and 5
clouds, 6 and 7 partial clouds, 8 to 11 rain, 12 and 13 storm, 14 and 15 snow, 16 and 17
fog. `chanceOfPrecipitation` is a percentage (a string on `SingleDay`).

`CurrentWeather` is the concept's weather circle, large, with high/low and rain chips
below; `SingleDay` the same with low, rain and humidity chips. The forecast pages are a
column of small circles, one per day or hour. `SunriseSunset` is two horizon circles.
Icons are the self-animating SVGs in `static/icons/` (the sun's rays turn once per
20 s); the skill's own Lottie set is not used.

### 8.4 `ovos-skill-date-time.openvoiceos`

| page | keys |
|---|---|
| `time` | `time_string` (`"HH:MM"`), `ampm_string`, `date_string` |
| `date` | `weekday_string`, `daymonth_string`, `year_string`, `date_string`, `location_string` |

`time` is the concept's clock ring (the "9:59" frame); `date` a ring with weekday,
day-month and year. `location_string` is the string `"None"` when no location is set;
the page hides it.

### 8.5 `ovos-skill-alerts.openvoiceos`

| page | keys |
|---|---|
| `Timer` | `activeTimers.timers[]` each `{alertId, backgroundColor, expired, percentRemaining (0..1), timerName, timeDelta (human string)}`; updates every second while running |
| `AlarmsOverviewCard` | `activeAlarmCount`, `activeAlarms[]` each `{alarmTime, alarmAmPm, alarmName, alarmExpired, alarmIndex, alarmRepeat, alarmRepeatStr}` |
| `ListView` | `header`, `items[]` (`{main, secondary}` or strings) |

`Timer` is one ring per timer, stacked, depleting with the time left. alerts 0.12.36a2
sends `percentRemaining` of about 0.99999 for the whole life of a timer
(docs/UPSTREAM_ISSUES.md), so progress is derived from `timeDelta` against the longest
value seen for that `alertId`; after a browser reload mid-timer the ring starts again
from full. The ring warms from blue to yellow under 30% remaining and to red under 10%;
an expired timer reads "Time's up" while its glow blooms on a loop.

`alarmExpired: true` means the alarm is going off now, not stale: `_alert_expired` plays
the sound or speaks, and `_display_alarms` holds the page with `override_idle=True` only
while some alarm `is_expired`, until stop, snooze or the missed timeout. It is the
loudest thing on screen (full brightness, shaking bell, red `.bloom-loop`, "Ringing");
when nothing rings, only the next alarm to fire glows. One or two alarms are chips;
three or more a two-by-two grid with "+n more" past four.

`ListView` is a hero circle with the item count, then `{main, secondary}` rows under a
small header.

### 8.6 `ovos.common_play` (measured with ovos-plugin-common-play 1.3.14a1)

**Pages and routing.** OCP never shows a page named `OVOSSyncPlayer`. It shows
`[PlayerLoader, SuggestionsView]` and sets `playerBackend: "OVOSSyncPlayer"` for audio
(`OVOSVideoPlayer` / `OVOSWebPlayer` for video and web). `PlayerLoader` routes to the
now-playing page, which renders the player when `playerBackend` is `OVOSSyncPlayer` and
the fallback (8.7) otherwise; `OVOSSyncPlayer` is routed too in case a later OCP shows it
directly.

**Now playing.** Keys: `title`, `artist`, `image`, `status`, `duration`, `position`,
`length`, `loopStatus`, `shuffleStatus`, `canResume`, `canPause`, `canNext`, `canPrev`,
`uri`. `status` is `"Playing"`, `"Paused"` or `"Stopped"`. The cover turns like a record
(20 s a turn) inside the progress ring, over a blurred wash of its own colours; pause
eases it back upright in 600 ms and play restarts the turn from upright. The status line
has equaliser bars, the time, the capability flags, and a pulsing red dot for a live
stream. A cover that is not loadable (a raw path not seen as an image, see 7.3) shows a
vinyl record instead. The title reads `"Extracting info from: <uri>"` for a moment while
OCP resolves a stream.

**Timing** (measured with ovos-audio-plugin-mpv 0.2.1 playing):
- `duration` is the track's own length in ms (a string at times, `"213000"`), 0 or -1
  (SomaFM) for a live stream. It is the only total the page uses.
- `position` is mpv `time-pos` in **seconds**, a float, about every 2 s (33.56, 35.56,
  37.6). OCP `player.seek()` writes ms into the same key. The page reads it as seconds
  unless that would put it past the end of a finite track.
- `length` is mpv `duration` × 1000 in ms. On a finite track it equals `duration` within
  a second (338561 vs 339000); on a live stream it is the growing buffer (43284, 45270,
  47333 while `position` went 14, 16, 18), so it is never a total.
- Live: `duration` not above 0, or `length` growing in step with `position`. The ring is
  full and still, and the line shows elapsed time and "live".
- The stock `OVOSSyncPlayer.qml` never binds `position` or `duration` (its formatters are
  unused); only the video seek bar does, assuming ms.
- mpv throttles reports to about 2 s and expects the GUI to keep its own progress clock,
  so the page runs one from the last report, freezes it on pause and restarts it on a new
  report, track or stop. OCP's "Paused" arrives up to one report late, so on resume the
  clock can step back by under 2 s.
- On a track change OCP leaves the previous `position` in place until mpv reports; a new
  track whose position equals the old report starts the clock at 0.

**Browse screens.**

| page | when OCP shows it | keys | render |
|---|---|---|---|
| `busy` | while a search runs, appended after the player pages | `footer_text` ("Searching...") | OCP's `animations/installing.json` Lottie (as `busy.qml` plays it, placed like `SYSTEM_Loading`) under a breathing halo, the label beneath; a dashed arc turning around thinking dots if the file is not cached |
| `SuggestionsView` | always beside `PlayerLoader`; focused at end of playback when the search has results (60 s), e.g. a stream that fails to open | `playlistModel.data[]`, `searchModel.data[]`, `uri` | rows with a round thumbnail, title, then source skill and length; the playing entry ringed in the accent |
| `Home` | the homescreen app icon (`ovos.common_play.OCP.homescreen.app`), appended as a page; only while nothing plays | `skillCards[]` `{skill_id, title, image, media_type[]}` | each skill as a gradient chip in its own hue with its icon inside, name and media types beneath |

List entries are `MediaEntry.infocard` dicts `{track, album (skill id), duration (ms),
image, source (skill icon path), uri}`. There is no artist, so the line under a title is
the source skill and length, and the thumbnail falls back to the skill icon. Home falls
back to the playlist as "Recent" when there are no skill cards. SuggestionsView shows the
playlist followed by the search results it does not already hold, under their own label,
rather than following the tab events `ocp.gui.show.suggestion.view.playlist` /
`.disambiguation`, which do not say which came last once the mirror stores events by
name.

### 8.7 Fallback

Any other `(namespace, page)`: a plain card with the namespace, page name and a
key/value dump of the session data. It is the main debugging tool and the one place a
card is allowed (section 9).

---

## 9. Visual design

Source: the Kickstarter page stills and the 2:17 "Mark II Demo" video. Vocabulary:

- Black background. Content is big circular chips stacked vertically, centred.
- No cards or nested panels, and no accent borders or edge stripes. Circles, rings and
  plain stacked text on black. Gradients, glows and motion are welcome as polish. This
  applies to every page (`tests/test_style_rules.py` enforces it).
- Idle: the clock and weather stack, as the stills show; a small logo badge appears only
  while nothing else is available.
- Face: two ring eyes and a curved smile, no nose. Eyes become lines when sleeping.
- Listening: blue vertical audio bars where the mouth is.
- Thinking: narrowed eyes.
- Clock: a ring with the time inside, blue tones.
- Timer: a ring that depletes, with the remaining time inside.
- Weather: a yellow sun icon above a temperature, in a circle, sitting above the clock.
- Font: a system font stack; no web fonts.
- Colours: near-black `#0b0f14` background, white text, one blue accent (`#1e9bff`
  family), yellow for the sun, as CSS variables on `:root`.

**Face reference** (measured on Mycroft's own animated face image: settled rest frame,
240 × 400 screen, doubled here for the 480 × 800 frame):

- Eyes are rings, not discs: outer diameter 71 (142), stroke 14 (28), dark centre. Each
  ring is grey (#6d6d6d) with a white (#f5f5f5) round-capped arc over its top half, so
  the white ends dip just below the midline. No pupil, no highlight.
- Eye centres at x 41 and 198.5 (82 and 397), 158 apart (316); y 95 (190).
- Mouth at rest: one round-capped arc, x 69..170 (101 wide, 202), stroke 12 at the
  centre (24), top edge y 206 (412), bottom 223 (446), centre-line sag about 6 (12).
- Open mouth (frames 51-55): a filled white D, flat top, round bottom, 61 × 32 (122 ×
  64), y 192..223.
- The face fills the upper half; the lower ~45% of the screen is empty.

**Face as drawn** (`static/face/face.js` `VISAGE_FACE`). It keeps the reference eyes,
strokes and rest smile but deliberately differs, because the measured face reads as a
wide oval and a filled open mouth hides the viseme motion:

- Eye centres 260 apart (x 110 and 370) instead of 316; eye line y 190.
- Mouth centre line at y 480 instead of 435 (rest arc about y 457..492), so the face at
  rest spans x 39..441, y 119..492: 402 × 373, about 1.08:1 instead of 1.4:1. The lower
  ~38% of the screen stays empty.
- Every mouth shape is an outline with the 24 px round-capped, round-joined stroke; the
  open visemes are hollow and drawn at full size with enough opening to keep a visible
  gap inside the stroke. Viseme 0 is about 170 × 80 px.

**Geometry.** Designed at 480 × 800 CSS px portrait, scaled to fit the window with a CSS
transform, aspect kept, inside a Mark II-like silhouette (an SVG rounded capsule; no
licensed artwork).

**Polish vocabulary** (shared classes in `visage.css`; reuse them rather than adding
per-page variants):

- **Glow**: `.hero-glow` (`glow()` in `pages/widgets.js`), a soft breathing halo as the first
  child of a circle. Its colour is the `--glow` variable, so a state can recolour it.
- **Gradient fill**: `.gradient-fill`, the lit-from-above radial fill for a hero circle.
- **Self-animating icon**: an SVG in `static/icons/` that carries its own `<style>`
  keyframes, radial gradients and a reduced-motion guard, used as `<img>` via `icon()`.
- **Stagger enter**: `.stagger-enter` on a parent; its children fade and rise in
  (260 ms, 60 ms apart).
- **State bloom**: `.bloom` swells the glow once when a state arrives, then breathes;
  `.bloom-loop` keeps swelling for as long as the state holds (an expired timer).

All motion stops under `prefers-reduced-motion`. Each animation stays under 60 lines of
CSS.

---

## 10. CLI, config, running

```bash
ovos-visage                 # GUI at http://127.0.0.1:8766, connects to 8181 and 18181
ovos-visage --host 0.0.0.0 --http-port 8766 --bus ws://127.0.0.1:8181/core --gui-id visage-1 -v
```

Options: `--host`, `--http-port` (8766; 8765 is the Mark 1 GUI), `--bus`, `--gui-id`
(default random), `--cache-dir` (`~/.cache/ovos_gui`, served at `/res/`), `--record
FILE.jsonl` (append every GUI message, for new fixtures), `-v`.

Full local run, three processes besides OVOS:

```bash
<gui-venv>/bin/ovos-gui-service
<gui-venv>/bin/ovos-skill-launcher ovos-skill-homescreen.openvoiceos
ovos-visage -v
```

---

## 11. Verifying a change

A green test run proves the state machine and view models against recorded traffic; it
does not prove a page looks right. For a visible change, run the stack, drive it, and
look:

| driver | what it does | what to look at |
|---|---|---|
| `docs/spike_say.py "what time is it"` | injects an utterance on the core bus, no microphone | the face over idle while thinking, shrinking to the badge when the page arrives |
| `tests/manual/demo.py` (`--list`, `STEP ...`, `--pace 2`) | a tour of every screen, waiting for each page and cleaning up after itself | each step prints what is on screen and what to check; failures are listed at the end |
| `tests/manual/show_templates.py [name]` | shows each `SYSTEM_*` template with sample data | every template in 8.2, including the fallbacks |
| `tests/manual/show_face.py [--sleeping]` | shows `SYSTEM_Face` | the full face, eyes closed when sleeping |
| `tests/manual/replay_visemes.py` | replays a recorded viseme list on the bus | the mouth shapes and timing without TTS |
| `tests/manual/play_media.py` | starts one OCP track without a skill (`--image`, `--length`) | now playing, the vinyl when there is no cover |
| `tests/manual/ocp_bus.py stop` / `home` | stops OCP, or opens OCP Home | SuggestionsView after a stop, Home |
| `ovos-visage --record FILE.jsonl` then `tests/manual/slice_recording.py` | records live GUI traffic and cuts a fixture out of it | new replay tests for a protocol change |

Check the browser console for errors and failed requests, and that content stays above
the 118 px attention strip on content pages. Browsers throttle hidden tabs, so animation
and mouth timing are only meaningful in a visible tab.

---

## 12. Repo conventions

- `pyproject.toml` with setuptools and a dynamic version from `ovos_visage/version.py`;
  `aiohttp` is the only runtime dependency; the `test` extra adds pytest,
  pytest-asyncio, pytest-cov, ruff and `websocket-client` (dev and manual drivers only).
- `Justfile` with `sync`, `test`, `lint`, `fmt`, `run`.
- `.github/workflows`: `unit_tests.yml` (uv, ruff, pytest), `pull-request-lint.yml`,
  `release_please.yml`, `release_build.yml`; release-please with a manifest.
- Conventional commits, branch and pull request into `main`.
- Functions under 30 lines, files under 300. Fail loud: an unknown protocol message is
  logged at warning with its full payload, never swallowed.
- Protocol behaviour is tested from recorded traffic in `tests/fixtures/*.jsonl`, so the
  state machine runs without OVOS. Never change OVOS code to make the client work.

---

## 13. Known limitations

| # | Limitation | Handling |
|---|---|---|
| 1 | The homescreen's weather widget needs the weather skill to answer `skill-ovos-weather.openvoiceos.weather.request`, which needs a working weather backend | Without it the weather circle stays hidden |
| 2 | Image values outside the cache that were never seen in session data, or are symlinks or non-images, are not served | The page shows its placeholder (7.3) |
| 3 | Viseme timing assumes ovos-audio runs on the same machine and sends the list at speech start | Measured skew about 3 ms on one machine; remote audio would need a clock offset |
| 4 | Skill and OCP quirks found along the way | docs/UPSTREAM_ISSUES.md, with versions and evidence |

---

## 14. Appendix: a measured spike log (framework `html`, announcement on both sockets)

```
[core] sent mycroft.gui.connected framework=html
[core] mycroft.gui.port -> {'port': 18181, 'gui_id': 'spike-client', 'framework': 'html'}
[gui] connected on 18181
[gui] sent mycroft.gui.connected on the GUI socket framework=html
[gui] {"type": "mycroft.events.triggered", "namespace": "system", "event_name": "recognizer_loop:utterance", "data": {"utterances": ["what time is it"], "lang": "en-us"}}
[gui] {"type": "mycroft.events.triggered", "namespace": "system", "event_name": "mycroft.skill.handler.start", "data": {"name": "TimeSkill.handle_query_time"}}
[gui] {"type": "mycroft.events.triggered", "namespace": "system", "event_name": "speak", "data": {"utterance": "It is twenty two zero nine", ...}}
[gui] {"type": "mycroft.session.list.insert", "namespace": "mycroft.system.active_skills", "position": 0, "data": [{"skill_id": "ovos-skill-date-time.openvoiceos"}]}
[gui] mycroft.session.set ns=ovos-skill-date-time.openvoiceos keys=['time_string']
[gui] mycroft.session.set ns=ovos-skill-date-time.openvoiceos keys=['ampm_string']
[gui] mycroft.session.set ns=ovos-skill-date-time.openvoiceos keys=['date_string']
[gui] mycroft.gui.list.insert ns=ovos-skill-date-time.openvoiceos pos=0 data=[{'url': None, 'page': 'time'}]
[gui] {"type": "mycroft.events.triggered", "namespace": "ovos-skill-date-time.openvoiceos", "event_name": "page_gained_focus", "data": {"number": 0}}
[gui] {"type": "mycroft.events.triggered", "namespace": "system", "event_name": "recognizer_loop:audio_output_start", "data": {}}
[gui] {"type": "mycroft.events.triggered", "namespace": "system", "event_name": "enclosure.mouth.viseme_list", "data": {"start": 1791688142.76, "visemes": [["4", 0.35], ...]}}
[gui] {"type": "mycroft.events.triggered", "namespace": "system", "event_name": "recognizer_loop:audio_output_end", "data": {}}
```

When the weather skill followed, the date-time keys arrived as `mycroft.session.delete`
and `mycroft.session.list.remove` on `mycroft.system.active_skills` at position 1.
