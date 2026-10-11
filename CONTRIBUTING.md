# Contributing to ovos-visage

Contributions are welcome: page components, protocol fixes, visual work, and tests.

## Development Setup

### Prerequisites

- Python 3.10+
- [uv](https://github.com/astral-sh/uv)
- [just](https://github.com/casey/just) (optional; every recipe has a `uv` equivalent below)

### Getting Started

```bash
git clone https://github.com/OscillateLabsLLC/ovos-visage
cd ovos-visage
just sync          # uv sync --extra test
```

## Common Commands

```bash
just test          # uv run pytest
just lint          # uv run ruff check . && uv run ruff format --check .
just fmt           # uv run ruff format .
just run -v        # uv run ovos-visage -v
```

## Protocol rule

`docs/SPEC.md` is the contract. Protocol behaviour is tested from recorded traffic in
`tests/fixtures/*.jsonl`, so the state machine runs without OVOS. When you change how a
GUI message is handled, record the real sequence from a live `ovos-gui-service` and add
it as a fixture. Never change OVOS code to make the client work.

## Pull Requests

1. Create a branch: `git checkout -b feat/my-change` or `fix/my-change`
2. Add tests for the change
3. Run `just lint` and `just test`
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`)
5. Open a pull request against `main`

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
