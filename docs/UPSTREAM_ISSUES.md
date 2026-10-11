# Upstream findings

Found while building ovos-visage against the versions named in each heading. None are
client bugs; ovos-visage works around them where it can. Line numbers are from those
versions and will drift. Where an issue or PR exists upstream, it is linked.

## ovos-skill-alerts 0.12.36a2

Filed: [#420](https://github.com/OpenVoiceOS/ovos-skill-alerts/issues/420)
timer widget count lags by one (`_update_homescreen` runs before
`_display_alert`, `__init__.py` ~1150).

### 1. `percentRemaining` is always ~1, so no timer ring can deplete

`util/ui_models.py` `build_timer_data`:
`start_time = alert.context.get('start_time') or datetime.now(...)`. The alert
context never carries `start_time`, so total time equals time remaining and
`percentRemaining` is 0.99999 for the whole life of the timer (recorded values
across one timer: 0.99999893, 0.99999886, ...). The stock QML `TimerCard`
`RoundProgress` is therefore always full too. Fix: record `start_time` in the
alert context when the timer is created, or derive it from the alert's
expiration minus its duration.

### 2. Homescreen widget action names do not match the listeners

`_update_homescreen_widgets` (`__init__.py` ~1608, ~1617) sends the widget
actions `ovos.gui.show.pending.timers` / `ovos.gui.show.pending.alarms`. The
skill registers handlers for `ovos.gui.show.active.timers` / `.alarms`
(~239-240). Tapping the homescreen timer or alarm chip does nothing.

### 3. `Timer.qml` binds `activeTimerCount`, which the skill never sets

The skill sets `activeTimers` only (~1675). The QML reads
`sessionData.activeTimerCount`, so it is always undefined.

### 4. Cancelling one of several pending timers fails instead of asking

With two timers pending, "cancel timer" answers "I could not find a matching
alert to cancel." The skill cannot pick one and never asks which. The grammar
suggests "cancel all stored timers" clears several at once (not tried).

### 5. Default alert names are taken from the utterance

"set a timer for 2 minutes" names the timer "set timer"; "set an alarm for 7 am"
names it "Set Alarm". Spoken confirmations become "Cancelling the timer called
set." A duration or time string would be a better default name.

## ovos-skill-date-time 1.11.8a1

### 6. `location_string` is the literal string "None" when no location is set

The skill does `str(location)` on a missing location. Clients have to special
case the string "None".

### 7. "when is sunset" is claimed by `handle_time_until`

The phrase matches the date-time skill's time-until intent and shows the `date`
page; the weather skill's SunriseSunset page never gets it. "what time does the
sun set" reaches the weather skill. Intent priority or a narrower vocab.

## ovos-skill-weather 1.5.3a2

### 8. Hourly forecast sends the clear-day code at night

Hours 23:00 to 02:00 arrive with animated code 0 (clear day), so the hourly page
shows a sun at midnight. Code 1 (night) exists for this.

## OCP skills: ovos-skill-news 0.4.10a4, ovos-skill-somafm 0.1.6a9, ovos-skill-pyradios 0.1.6a8, ovos-skill-youtube-music 0.1.10a3

### 9. Four media skills fail to import: `from version import VERSION_MAJOR`

Each `__init__.py` (news line 15, the others line 13) imports a top-level `version`
module that is not installed as one. Every skills start logs
`Failed to load plugin entry point ... No module named 'version'`, so "play the news"
and "play groove salad on soma fm" find nothing ("I'm not sure how to play the news").
Only `ovos-skill-local-media` loads. Fix: a relative import (`from .version import ...`).

## ovos-audio 2.2.8a1 with ovos-audio-plugin-mpv 0.2.1 (ovos-plugin-manager 2.12.5a1)

### 10. Every OCP playback fails in the mpv backend, but OCP reports Playing

Fix open upstream: https://github.com/OpenVoiceOS/ovos-media-plugin-mpv/pull/31 (the
one-line fix below plus a unit test).

`ovos_audio.audio:_play` logs `'OVOSMPVService' object has no attribute 'meta'` on
every play, for http streams and local files alike (seen on four separate plays). mpv is
the only backend loaded. Root cause: `OVOSMPVService(MPVBaseService, AudioBackend).__init__`
calls only `AudioBackend.__init__`, but the MRO resolves `load_track` to
`MediaBackend.load_track`, which uses `self.meta`, set only in `MediaBackend.__init__`.
Unfixed on the plugin's `dev` branch. One-line fix: `self.meta = {}` in that `__init__`
(or call `MediaBackend.__init__`). A second, local failure can hide behind it on macOS:
Homebrew mpv linked against an older ffmpeg than the one installed (`brew reinstall mpv`). OCP
sets `status: "Playing"` anyway and never hears otherwise, so the GUI shows a track
playing in silence and `position` stays 0.

## ovos-plugin-common-play 1.3.14a1 (OCP GUI)

### 11. The player page is `PlayerLoader`; `OVOSSyncPlayer` is only a session value

`gui.py` `_get_pages_to_display` shows `[PlayerLoader, SuggestionsView]` and puts
`playerBackend: "OVOSSyncPlayer"` in session data for the QML loader to resolve. A
non-QML client has to know that indirection. ovos-visage routes `PlayerLoader` and
reads `playerBackend`.

### 12. `image` is often a raw filesystem path outside the GUI cache

The default cover (`ovos_plugin_common_play/ocp/res/ui/images/ocp.png`) and skill
media paths are sent as absolute paths in the OVOS venv, not under
`~/.cache/ovos_gui`, so remote or browser GUIs cannot load them. Sending the image
through the GUI resource cache, or as a URL, would fix it.

### 13. Track timing keys and units disagree

Track changes set `duration` (ms, sometimes a string such as `"213000"`); the backend
seekbar sync sets `position` and `length`. Measured with mpv playing: `position` is mpv
`time-pos` in seconds (33.56, 35.56, ...) although `ovos_plugin_mpv` documents
`playback_time` as milliseconds, and OCP `player.seek()` writes milliseconds into the
same `position` key. `length` is mpv `duration` x 1000, which for a live stream is the
growing buffer, not a length. `MediaEntry.length` is documented as seconds
(`ovos_utils/ocp.py` 196, 300) but arrives in ms. The stock `OVOSSyncPlayer.qml` binds
none of these, so nothing upstream exercises the contract. One unit per key (ms) and no
`length` for live streams would fix it.

### 14. The stopped player never leaves the screen

After "stop" the session stays `status: "Stopped"` with `PlayerLoader` shown, because
`app_view_timeout_enabled` is false by default. The screen does not return to idle
until another skill takes over.

## ovos-gui 1.5.3a1

### 15. `show_input_box()` shows `SYSTEM_InputBox`, which has no QML

The API is in ovos-bus-client 2.11.25a1: `ovos_bus_client/apis/gui.py`
`GUIInterface.show_input_box` (~868-897) sets
`title`, `placeholder`, `confirm_text`, `exit_text`, `skill_id_handler` and
shows `SYSTEM_InputBox`. ovos-gui ships no `SYSTEM_InputBox.qml`: its
`ovos_gui/res/gui/qt5/` has the other eight `SYSTEM_*` templates only, and no
file named `*InputBox*` exists in either the GUI virtualenv or the OVOS one
(searched both). A Qt client therefore cannot show the input box. Fix: add the
QML to ovos-gui's system resources, or drop the template from the API.

### 16. Re-showing a namespace with no pages reorders the active list silently

`ovos_gui/namespace.py` `_activate_namespace` moves an already-active namespace
to position 0 of `active_namespaces` and relies on `Namespace.activate()` to tell
clients with `mycroft.session.list.move`. `activate()` returns early with "Tried
to activate namespace without loaded pages" when the namespace has no pages, and
`handle_show_page` activates before `_load_pages`. So when a skill re-shows a
namespace whose pages were all removed, the server reorders and clients do not.
Every later positional `session.list.remove` then removes the wrong namespace on
the client. Seen live: OCP removed its last page, then showed `PlayerLoader`; the
next `list.remove position 1` removed a template namespace on the server but OCP
on every client, leaving a stale page up until reconnect
(tests/fixtures/ovosgui_silent_reorder.jsonl). Fix: send the move whenever the
position changes, regardless of pages. ovos-visage now follows the silent move.

## ovos-core stop pipeline (ovos-stop-pipeline-plugin)

### 17. A spoken "stop" goes to the last active skill, not to what is playing

"stop" is matched to the most recently active skill that can stop. During OCP playback
that is often another skill: a "Stop." after "flip a coin" went to
`skill-ovos-randomness.openvoiceos:stop` and the music kept playing; the next "Uh stop."
15 s later reached `ovos.common_play:stop`. Right after "play groove salad on
soma fm" it can land on the SomaFM skill's stop handler the same way. Stop should
prefer whatever is playing audio. Workaround for tests: `ovos.common_play.stop` on the
bus (`tests/manual/ocp_bus.py stop`).

## ovos-plugin-common-play 1.3.14a1 and ovos-ocp-youtube-plugin 0.0.9a2

### 18. A failing extractor makes "skip" run through the whole playlist

With youtube-music results, "Skip." made OCP try every track in turn: each one logs
`error extracting stream with OCPYoutubeExtractor`, the title flips between
`"Extracting info from: <url>"`, the raw `watch?v=...` id and `"PLAYBACK ERROR"`, and
`status` cycles Paused, Stopped, Playing, Paused for about 30 entries before one plays.
A stream that fails to open (SomaFM `groovesalad2-128-mp3`, stopped by mpv 0.3 s after
start) ends playback and focuses SuggestionsView instead of trying the next result.

### 19. `position` is not reset when the track changes

The previous track's `position` (for example 94.56) stays in the session until the
backend reports for the new track, so every client shows the old elapsed time for the
first ~2 s of a new track.

## ovos-skill-alerts 0.12.36a2 (continued)

### 20. Spoken "cancel all alarms" never cancels all when several are pending

With more than one alarm pending, both "cancel all alarms" and "cancel alarm"
answer "I could not find a matching alert to cancel". The cancel-all
branch of `handle_cancel_alert` (`__init__.py` ~772) runs only when
`message.data.get("stored")` is set. No `cancel_alert.intent` template has a
`{stored}` slot ("all" is literal text), so the padacioso match never sets it; the
handler falls through to `_resolve_requested_alert`, which finds no single alarm.
The to-do list handlers (~1006, ~1066) also accept
`voc_match(utterance, "stored")`; doing the same here would fix it. The GUI path
works: one `ovos.alerts.cancel_alarm` message with
`{"alarmIndex": [id1, id2, id3]}` dismissed all three (the skill said "alarm
dismissed" three times, and the store went to 0 pending). `tests/manual/demo.py`
dismisses timers and alarms this way.
