---
id: 001
type: transitional
status: active
assigned_role: executor
requires: [000]
unlocks: [002, 003]
---
# State: Core Terminology & Structure Refactor

## Semantic Intelligence
The codebase currently uses "roadmap" as the primary term. This must be refactored to "roadmap" globally in constants and directory discovery logic. The default folder name should change from `roadmap/` to `roadmap/`.

## Proof of Arrival (Definition of Done)
- [x] `DEFAULT_DIRECTORIES.ROADMAP` changed to `ROADMAP` in `src/constants/index.ts`.
- [x] `findRoadmapRoot` updated to search for `roadmap/` or `roadmap.json` and renamed to `findRoadmapRoot`.
- [x] Global terminology refactor: `roadmap` -> `roadmap`, `State` -> `State` (aliased).
- [x] `package.json` name updated to `agent-roadmap` and bin to `roadmap`.
- [x] `State` interface updated with `type`, `hype`, `requires`, and `unlocks`.
- [ ] Terminal test: `roadmap status` works in a repo with a `roadmap/` folder.

## Hype
> Standardized the project core around "Roadmaps" instead of "Roadmaps". The agent-native foundation is solidifying. 🏗️
