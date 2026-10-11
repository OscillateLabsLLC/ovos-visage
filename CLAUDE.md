# ovos-visage

Browser GUI client for OpenVoiceOS in the 2018 Mark II Kickstarter concept style.
**Read `docs/SPEC.md` first. It is the design and protocol reference.** Facts marked
measured there were observed against the versions in its section 3; re-measure before
contradicting them.

## Hard rules

- **Never install into, upgrade, or dry-run against the virtualenv OVOS runs from.** A
  dependency resolution there can silently downgrade `ovos-workshop` and break OVOS.
  `ovos-gui-service` and the homescreen skill live in a separate GUI virtualenv; this
  project's own dependencies live in its `.venv` via `uv sync`.
- **Never modify OVOS code** (`ovos-gui`, skills, workshop). If the protocol does not do
  what you need, change the client, or stop and report.
- **Branch + PR, never push `main`.** A maintainer merges. Conventional commit titles.
- **Deterministic evidence.** Run the change: the drivers and checks in `docs/SPEC.md`
  section 11 are commands to run and screens to look at. Paste the evidence in the PR.
- One logical action per Bash call; no `;`-chained unrelated commands.

## Running the stack (three processes plus OVOS)

```bash
<gui-venv>/bin/ovos-gui-service
<gui-venv>/bin/ovos-skill-launcher ovos-skill-homescreen.openvoiceos
uv run ovos-visage -v          # http://127.0.0.1:8766
<gui-venv>/bin/python docs/spike_say.py "what time is it"   # no mic needed
```

## Repo conventions

uv + just, setuptools with dynamic version, ruff line length 130, pytest with coverage,
four GitHub workflows, release-please. Functions under 30 lines, files under 300, no
narrating comments. The visual rules in `docs/SPEC.md` section 9 are enforced by
`tests/test_style_rules.py`.

## Workflow

One PR per change. Record protocol traffic into `tests/fixtures/*.jsonl`
(`ovos-visage --record`, then `tests/manual/slice_recording.py`) and drive unit tests
from it, so the state machine is tested without OVOS running.
