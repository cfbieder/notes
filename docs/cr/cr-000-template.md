# CR000 — <Title>

> Template. Copy to `cr-NNN-<topic>.md` (next number, zero-padded), fill it in, and add the
> row to [README.md](docs/cr/README.md). A CR captures motivation, decision, and outcome —
> enough that a future session can reconstruct *why*, not just *what*.

**Status:** Proposed
**Severity:** Feature (small / medium / large) · Fix · Chore
**Origin:** <user request / bug / roadmap item>, YYYY-MM-DD

## Problem

<What is wrong or missing today, in concrete terms — the current behaviour, the file(s) that
own it, and why it matters. Link the code. A reader who has never seen this area should be
able to reproduce the problem from this section alone.>

## Decision

<The chosen approach and, for each significant fork, the options considered and why this one
won. Decisions made by omission are the ones that hurt later — write them down. Note what is
deliberately NOT being done and why.>

**Out of scope:** <explicit non-goals, so the CR cannot quietly grow>

## Impact checklist

- [ ] **Migration** — new/changed schema? Numbered file added, `user_id NOT NULL` + FK +
      index on any new owned table, uniqueness scoped per user, backfill for existing rows.
      Safe to apply before this feature cuts over? (The deploy applies every pending file.)
- [ ] **Isolation** — every new query filters by the authenticated user; every new route sits
      inside the authenticated plugin scope. There is no RLS backstop.
- [ ] **Secrets/config** — new env var added to `backend/.env.example` and
      `backend/.env.prod.example`, and mapped explicitly in `docker-compose.prod.yml`.
- [ ] **Tests** — `backend/tests/` coverage for auth, vault, sync, or data-shaping logic;
      added to `test:ci` in `backend/package.json` if it can run without the ocr-llm gateway.
- [ ] **Guards** — did this CR create a mechanically-checkable convention?
      Add it to `scripts/ci-guards.sh` rather than relying on the next review to catch it.
- [ ] **Public repo** — nothing personal (hosts, IPs, data) enters the tree; README /
      CONTRIBUTING still accurate if setup changed.
- [ ] **Docs** — status.md / project-description.md / project-roadmap.md touched as needed.

## Acceptance

<How we know it works — the observable behaviour, not the implementation.>

## Outcome

<Filled at shipping: what actually landed, deviations from the decision above, follow-ups
spawned. The ship date and version go in the INDEX, not here.>
