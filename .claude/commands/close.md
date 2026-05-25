---
description: Finalize release — docs, version bump, commit, push, deploy
allowed-tools: Bash(git *), Bash(./scripts/*), Bash(scripts/*), Bash(cat *), Bash(ls *), Edit, Read, Write
---

## Context
- Current branch: !`git branch --show-current`
- Status: !`git status --short`
- Current VERSION: !`cat VERSION`
- Last tag: !`git describe --tags --abbrev=0 2>/dev/null || echo "none"`
- Commits since last tag: !`git log --oneline $(git describe --tags --abbrev=0 2>/dev/null)..HEAD 2>/dev/null || git log --oneline -20`

## Task
Finalize this release end-to-end for **Noted**. Follow the project conventions in `CLAUDE.md` — release-relevant docs live under `Documentation/`.

1. **Update documentation** — Review the commits listed above and update:
   - `Documentation/NOTED_CURRENT_STATE.md` — reflect any changed features, data model, routes, schema, scripts, or architecture that shipped.
   - `Documentation/NOTED_NEXT_STEPS.md` — mark completed CRs/items as done, add a "Released vX.Y.Z (YYYY-MM-DD)" entry summarising what shipped, and capture any new known issues discovered.
   - `Documentation/CR/CR0XX_*.md` — flip `Status:` to `Completed` (or `In progress`) on each CR that was completed or advanced; update scope/acceptance notes if they evolved. If the release warrants a new CR (substantive feature, multi-session work, architectural impact), create the next-numbered file and link it from `NOTED_NEXT_STEPS.md`. Trivial fixes stay as bullets in `NOTED_NEXT_STEPS.md`.

2. **Commit the docs** — Stage and commit the documentation updates *before* bumping the version, so the version commit stays focused. Use `docs: release notes for vX.Y.Z` (or similar Conventional Commits message). Skip if there are no doc changes.

3. **Bump version** — Decide patch/minor/major from the diff (semver). Run:
   - `./scripts/update_version.sh patch` (or `minor` / `major` / explicit `X.Y.Z`).
   This updates `VERSION`, `backend/package.json`, `frontend/package.json`, and `frontend/.env` (VITE_APP_VERSION), **and creates the commit `chore: bump version to vX.Y.Z` plus the annotated tag `vX.Y.Z`**. Confirm the new version with `cat VERSION`.

4. **Push** — Push commits and the new tag to origin:
   ```
   git push origin HEAD
   git push origin vX.Y.Z
   ```

5. **Deploy to prod** — Run `./scripts/deploy-to-production.sh` from the repo root. This auto-backs up the prod DB, rebuilds + restarts production containers (`noted-db`, `noted-api`, `noted-web`), runs migrations, and verifies health at `https://noted.tail413695.ts.net`. Watch the output and report success/failure.

## Guardrails
- Stop and ask before any destructive or irreversible step: force-push, deploying a **major** version bump, tagging over an existing tag, or anything `deploy-to-production.sh` warns about.
- Never use `--no-verify` or skip hooks. Never pass `--no-tag` / `--no-commit` to `update_version.sh` unless explicitly asked.
- If `git status` shows unrelated uncommitted work at the start (files unrelated to the release), ask before staging — don't sweep it into the docs/version commits. Note: `update_version.sh` will refuse to run if the working tree has unrelated changes beyond its expected version files, so commit or stash those first.
- Report what was done at each step (file paths changed, version chosen + why, tag pushed, deploy outcome).
- Production URL is `https://noted.tail413695.ts.net` — confirm health there if the deploy script's check is ambiguous.
