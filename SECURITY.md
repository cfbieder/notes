# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, report privately through GitHub's private vulnerability reporting:

1. Go to the **[Security tab](https://github.com/cfbieder/notes/security)** of this repository.
2. Click **"Report a vulnerability"**.
3. Describe the issue, steps to reproduce, and impact.

You'll get a private channel to coordinate a fix. We aim to acknowledge reports
promptly and will keep you updated on remediation. Please give us reasonable time
to release a fix before any public disclosure.

## Scope

This is a self-hosted application. Deployments are the operator's responsibility,
including securing secrets (`.env` files), TLS, database access, and network
exposure. Reports about the code itself — auth, injection, data exposure,
dependency vulnerabilities — are in scope.

## Supported versions

The latest release on `main` receives security fixes. See
[docs/cr/README.md](docs/cr/README.md) for version history.
