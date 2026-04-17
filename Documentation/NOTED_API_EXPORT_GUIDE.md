# Noted Export API — Quick Reference

Base URL: `https://noted.tail413695.ts.net`

All endpoints require authentication via a long-lived API token passed as a Bearer token.

---

## Authentication

All requests must include an API token in the Authorization header:

```
Authorization: Bearer noted_<your-token>
```

Alternatively, pass the token as a query parameter:

```
?token=noted_<your-token>
```

### Creating a token

Tokens are created via the Noted API. You need a short-lived JWT first (from login), then:

```bash
curl -X POST https://noted.tail413695.ts.net/api/v1/auth/token \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name": "project-sync", "expires_in_days": 365}'
```

Response (token is shown once — save it):

```json
{
  "data": {
    "token": "noted_abc123...",
    "name": "project-sync",
    "expires_at": "2027-04-17T...",
    "message": "Save this token — it will not be shown again."
  }
}
```

---

## Export a note by title

```
GET /api/v1/notes/export/:title
```

Returns the raw markdown content of a note. Title matching is case-insensitive. URL-encode the title if it contains spaces or special characters.

### Examples

```bash
# Fetch a single note
curl -s -H "Authorization: Bearer noted_<token>" \
  "https://noted.tail413695.ts.net/api/v1/notes/export/Project%20Spec" \
  -o project-spec.md

# Using query param auth instead
curl -s "https://noted.tail413695.ts.net/api/v1/notes/export/Project%20Spec?token=noted_<token>" \
  -o project-spec.md
```

### Response

- **200**: Raw markdown (`Content-Type: text/markdown`), with `Content-Disposition: attachment` header
- **404**: `{"error": "Not Found", "message": "No note found with title \"...\"" }`
- **401**: Invalid or expired token

---

## Example: getDocs.sh

A shell script to pull project documentation from Noted into a local directory:

```bash
#!/bin/bash
# getDocs.sh — Fetch project docs from Noted
# Usage: ./getDocs.sh

NOTED_URL="https://noted.tail413695.ts.net/api/v1/notes/export"
TOKEN="noted_<your-token>"
DOCS_DIR="./docs"

mkdir -p "$DOCS_DIR"

fetch_note() {
  local title="$1"
  local filename="$2"
  local url="${NOTED_URL}/$(printf '%s' "$title" | jq -sRr @uri)"

  echo "Fetching: $title -> $filename"
  local http_code
  http_code=$(curl -s -w '%{http_code}' \
    -H "Authorization: Bearer $TOKEN" \
    "$url" -o "$DOCS_DIR/$filename")

  if [ "$http_code" = "200" ]; then
    echo "  OK"
  else
    echo "  FAILED (HTTP $http_code)"
    rm -f "$DOCS_DIR/$filename"
  fi
}

# Add your notes here:
fetch_note "Project Spec"    "project-spec.md"
fetch_note "Dev Plan"        "dev-plan.md"
fetch_note "API Reference"   "api-reference.md"

echo "Done."
```

Make executable: `chmod +x getDocs.sh`

---

## Token management

```bash
# List all tokens
curl -s -H "Authorization: Bearer noted_<token>" \
  https://noted.tail413695.ts.net/api/v1/auth/tokens | jq

# Revoke a token by ID
curl -X DELETE -H "Authorization: Bearer noted_<token>" \
  https://noted.tail413695.ts.net/api/v1/auth/token/<token-id>
```

---

## Notes

- The Noted server is accessible only via Tailscale (`100.119.240.123` or `noted.tail413695.ts.net`)
- Tokens are prefixed with `noted_` and never expire unless `expires_in_days` was set at creation
- Title matching is case-insensitive: `"project spec"` matches a note titled `"Project Spec"`
- Trashed notes are excluded from export
