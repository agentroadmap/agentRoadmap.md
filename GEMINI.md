# agentRoadmap.md: Agent Context

## Project DNA
This project is an **Agent-First** roadmap system. It uses a Directed Acyclic Graph (DAG) of **States** to guide autonomous execution and project evolution.

## Core Mandates
- **Scout -> Map -> Reach:** Always follow the contribution loop defined in `roadmap/ROADMAP_CONTRIBUTING.md`.
- **Proof of Arrival:** Never mark a state as `reached` without providing terminal output or technical validation in the node file.
- **Hype is Required:** Every reached state must have a concise promotional "Hype" statement.
- **GLOSSARY Compliance:** Use terms (State, Terminal State, Obstacle, etc.) strictly as defined in `roadmap/GLOSSARY.md`.

## Role Personas
- **Manager:** Focus on `Scout` and `Map`. Analyze `DNA.md` to identify dependencies and create new nodes in `roadmap/nodes/`.
- **Executor:** Focus on `Reach`. Implement technical changes and provide **Proof of Arrival**.
- **Promoter:** Monitor `roadmap/MAP.md` for new `reached` states and prepare hype-driven updates.

## Operational Standards
- Always update `roadmap/MAP.md` when adding or transitioning nodes.
- If a path is blocked, immediately create an `obstacle` node and link it.
- Use `DNA.md` as the ultimate North Star for all strategic decisions.

## Development Commands (Underlying CLI)
- `bun i` - Install dependencies (only when necessary for development)
- `bun run cli` - Run the roadmap CLI tool directly from source
- `bun run build` - Build the CLI tool
- `bun run check` - Run formatting and linting (Biome)
- `bun test` - Run the test suite

## Simplicity Rules
- Favor minimal APIs and single implementations for similar concerns.
- Retrospectively simplify code after completing a task.
- Avoid unnecessary abstraction layers (services, normalizers) unless immediately required.
