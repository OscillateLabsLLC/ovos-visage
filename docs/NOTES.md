# Skill notes

What the pages were built against, measured with the versions in `docs/SPEC.md`
section 3. Skill behaviour changes between releases; re-check before relying on it.
Upstream bugs found along the way are in `docs/UPSTREAM_ISSUES.md`.

## Homescreen (ovos-skill-homescreen 3.0.4a2)

- It loads with `ovos-skill-launcher` by skill id in the GUI virtualenv (SPEC 3.1). The
  client's built-in blank idle is only for when no namespace has a page.
- It pushes `time_string` itself about once a minute, so the idle clock follows session
  data, not the browser clock.
- The alerts skill reports the timer widget count before it adds the new timer to its GUI
  list, so the count lags by one: a single new timer reports `count: 0`, a second
  concurrent one `count: 1`. The idle timer circle shows what the skill reports. The
  Timer page is shown with `override_idle`, so it stays on top until the timer ends.

## Weather (ovos-skill-weather 1.5.3a2) and date-time (ovos-skill-date-time 1.11.8a1)

- Weather icons are `static/icons/*.svg`; each animates itself with an embedded `<style>`,
  so the idle chip and the weather pages use the same `<img>`.
- "what is the weather" shows `CurrentWeather`, then `HourlyForecast` about 7 s later,
  then `DailyForecast`. "what is the weather tomorrow" shows `SingleDay`; "what is the
  weather tonight" shows `HourlyForecast`.
- "when is sunset" goes to the date-time skill (`handle_time_until`, `date` page). "what
  time does the sun set" reaches `SunriseSunset`.
- The date-time skill sends `location_string` as the string `"None"` when no location is
  set; the date page hides it.

## Alerts (ovos-skill-alerts 0.12.36a2)

Phrases that work: "set a timer for 2 minutes", "set an alarm for 7 am", "cancel timer"
and "cancel alarm" (only with one pending; with two it answers "I could not find a
matching alert to cancel"), "stop" (dismisses an expired timer). Reminder phrases were
taken by the persona service or the reschedule intent, so `ListView` has no live
recording.

Rings are kept per `alertId`, so their CSS transition spans the skill's one-second
updates. Timer progress is derived from `timeDelta` (SPEC 8.5).

Dismissing from a script: the skill's GUI events are prefixed with its id by
`gui.register_handler`, so the timer event is
`ovos-skill-alerts.openvoiceos.ovos.alerts.cancel_timer` with `{"timer": {"alertId":
id}}`; the bare `ovos.alerts.cancel_timer` reaches nothing. One `ovos.alerts.cancel_alarm`
with `{"alarmIndex": [ids]}` dismisses several alarms at once.
`ovos.gui.show.active.alarms` (the homescreen alarm chip's action) shows every pending
alarm without speaking.

## OCP (ovos-plugin-common-play 1.3.14a1, ovos-audio-plugin-mpv 0.2.1)

Playback needs the mpv plugin fix in `docs/UPSTREAM_ISSUES.md` 10. With it: "play groove
salad on soma fm" (the SomaFM skill picks a station and does not always pick Groove
Salad; a stream can fail to open and a retry plays), "pause", "resume". Spoken "pause"
and "resume" change `status` and give no spoken reply.

A spoken "stop" goes to the last active skill and does not always reach OCP
(`docs/UPSTREAM_ISSUES.md` 17); drive OCP from the bus instead:

```bash
python tests/manual/ocp_bus.py stop        # ovos.common_play.stop
python tests/manual/ocp_bus.py home        # OCP Home, as the homescreen icon opens it
python tests/manual/play_media.py          # play one track without a skill
```

After a stop OCP shows `SuggestionsView` by itself when it holds search results, for
60 s, then gives the screen back. `Home` only appears while nothing plays; during
playback the homescreen app action re-shows `PlayerLoader`.

## Answers and templates

- "flip a coin" shows a short `SYSTEM_TextFrame`; "who is albert einstein" (DuckDuckGo)
  shows `SYSTEM_ImageFrame`.
- No installed skill sends a long `SYSTEM_TextFrame`; `tests/manual/show_templates.py
  text-long` does.
- "what is my ip address" shows short TextFrames but reads out the machine's real
  addresses, so the demo leaves it out.

## Demo tour

`tests/manual/demo.py` sends utterances onto the core bus the way `docs/spike_say.py`
does, and bus events where speech is unreliable. It waits for each skill's
`gui.page.show` rather than sleeping, prints what is on screen and what to look at, and
lists failures in a summary (exit status 1 if any). Cleanup always runs, including on
Ctrl-C: it dismisses only the timers and alarms the run created, stops OCP and clears
its template namespaces. `--pace` multiplies the tour's own dwells only.

| step | what it does |
|---|---|
| face | "what time is it" (`time`, the badge face speaking), "what's the date" (`date`) |
| weather | "what is the weather" (three pages), "what is the weather tomorrow", "what time does the sun set" |
| timer | timers for 20 s and 45 s (the second updates the page already up, with no new `gui.page.show`); waits for the first to expire, then dismisses both |
| alarms | three alarms; after the second and third it sends `ovos.gui.show.active.alarms`, so the screen goes one chip, two chips, grid; all dismissed in one message |
| alarm-ring | opt-in: an alarm for the first whole minute at least 15 s away (a 15 to 75 s wait), shown ringing, then dismissed |
| list | "list my alerts" shows no page (`_display_alerts` skips `AlertType.ALL`), so the step shows `ListView` with sample rows |
| answers | "flip a coin", "who is albert einstein" |
| templates | every `tests/manual/show_templates.py` sample, 4 s each |
| media | now playing, pause, resume (retried once if OCP reports Stopped right after Playing), stop to `SuggestionsView`, `Home`, the vinyl via `play_media.py`, stop |
