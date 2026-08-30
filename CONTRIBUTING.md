# Contributing to Noted

Thanks for your interest in improving Noted! This guide explains how to propose
changes safely.

## The workflow (fork & pull request)

You do **not** get direct write access to this repository, and you don't need it.
The standard open-source flow is:

1. **Fork** this repo to your own GitHub account (the "Fork" button).
2. **Clone** your fork and create a branch:
   ```bash
   git clone https://github.com/<your-username>/<repo>.git
   cd <repo>
   git checkout -b my-change
   ```
3. **Make your change**, commit it (see commit style below), and push to your fork.
4. Open a **Pull Request** against this repo's `main` branch.
5. A maintainer reviews it, may request changes, and merges when it's ready.

Every change is reviewed before it lands — this is what keeps the project safe.

## Before you start

- For anything non-trivial, **open an issue first** to discuss the approach. This
  avoids wasted work on something that won't be merged.
- Keep pull requests **focused** — one logical change per PR is much easier to
  review than a large mixed one.

## Development setup

See [README.md](README.md#quick-start-development) for how to run the app locally.

## Coding conventions

- **JavaScript:** `camelCase` for variables and functions.
- **Database:** `snake_case` for columns and tables.
- **API responses:** `{ data, meta }` on success; `{ error, message, statusCode }`
  on error. All routes are under `/api/v1/`.
- **Migrations:** forward-only, numbered SQL files in `backend/migrations/`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) —
  `feat:`, `fix:`, `chore:`, `docs:`, etc.
- **UI:** use the `ConfirmModal` component — never native `confirm()` / `alert()`.

## Pull request checklist

Before opening a PR, please confirm:

- [ ] No secrets, credentials, API keys, or personal `.env` files are included.
- [ ] The change is scoped to one thing and every changed line relates to it.
- [ ] Existing tests pass and new behavior has tests where practical.
- [ ] Commit messages follow Conventional Commits.
- [ ] Docs updated if you changed behavior, config, the API, or the schema.

## Security

If you find a security vulnerability, please **do not** open a public issue.
Instead, report it privately to the maintainer (see the repository's Security tab
/ contact). We'll coordinate a fix before any public disclosure.
