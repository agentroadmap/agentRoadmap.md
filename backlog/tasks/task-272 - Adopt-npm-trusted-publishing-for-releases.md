---
id: task-272
title: Adopt npm trusted publishing for releases
status: To Do
assignee:
  - '@codex'
created_date: '2025-09-17 23:25'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Align Backlog.md release automation with npm Trusted Publishing as implemented in the codex repository. Update the release workflow to authenticate with npm via GitHub OIDC, remove the reliance on the NODE_AUTH_TOKEN secret, ensure the npm CLI version satisfies provenance requirements, and document the trusted publisher setup steps for all backlog packages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Update .github/workflows/release.yml so the npm-publish job uses actions/setup-node@v5 (or later with trusted publisher support), installs npm 11.5.1 or newer, and runs npm publish --provenance without NODE_AUTH_TOKEN.
- [ ] #2 Ensure the publish-binaries job also relies on the GitHub OIDC identity (no NODE_AUTH_TOKEN) when publishing each platform package, updating node setup and npm CLI accordingly.
- [ ] #3 Document the trusted publisher configuration (linking this workflow to the backlog.md and platform packages, secret removal steps, recovery plan) in the repo docs or release checklist.
- [ ] #4 Verify via a dry run or staging tag that the workflow completes the npm publish steps using trusted publishing and records provenance.
<!-- AC:END -->
