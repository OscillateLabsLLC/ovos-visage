# Task runner for ovos-visage (uv + just)

default:
    @just --list

# Install the package and test extras into .venv
sync:
    uv sync --extra test

# Run the test suite with coverage
test:
    uv run pytest

# Lint and format check
lint:
    uv run ruff check .
    uv run ruff format --check .

# Format the code
fmt:
    uv run ruff format .

# Run the GUI client (browser on 8766, core bus 8181, GUI socket 18181)
run *ARGS:
    uv run ovos-visage {{ARGS}}
