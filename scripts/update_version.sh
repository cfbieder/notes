#!/usr/bin/env bash
set -euo pipefail

# update_version.sh — Semantic versioning with date stamp and git tags
#
# Usage:
#   ./scripts/update_version.sh patch       # 0.1.0 -> 0.1.1
#   ./scripts/update_version.sh minor       # 0.1.0 -> 0.2.0
#   ./scripts/update_version.sh major       # 0.1.0 -> 1.0.0
#   ./scripts/update_version.sh 2.0.0       # explicit version

RED='\033[0;31m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$PROJECT_ROOT/VERSION"

log()  { echo -e "${BLUE}[version]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

usage() {
  echo "Usage: $0 <major|minor|patch|X.Y.Z> [--no-tag] [--no-commit]"
  echo ""
  echo "Options:"
  echo "  --no-tag       Skip creating a git tag"
  echo "  --no-commit    Skip creating a git commit"
  echo ""
  echo "Examples:"
  echo "  $0 patch              # 0.1.0 -> 0.1.1"
  echo "  $0 minor              # 0.1.0 -> 0.2.0"
  echo "  $0 major              # 0.1.0 -> 1.0.0"
  echo "  $0 2.0.0              # Set explicit version"
  echo "  $0 patch --no-tag     # Bump without git tag"
  exit 1
}

# Read current version from VERSION file
get_current_version() {
  if [[ ! -f "$VERSION_FILE" ]]; then
    die "VERSION file not found at $VERSION_FILE"
  fi
  tr -d '[:space:]' < "$VERSION_FILE"
}

# Validate semver format (X.Y.Z)
validate_semver() {
  local ver="$1"
  if [[ ! "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    die "Invalid semver format: '$ver' (expected X.Y.Z)"
  fi
}

# Bump version based on type
bump_version() {
  local current="$1"
  local bump_type="$2"

  local major minor patch
  IFS='.' read -r major minor patch <<< "$current"

  case "$bump_type" in
    major) major=$((major + 1)); minor=0; patch=0 ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    patch) patch=$((patch + 1)) ;;
    *)     die "Unknown bump type: $bump_type" ;;
  esac

  echo "${major}.${minor}.${patch}"
}

# Update a JSON file's "version" field using node (avoids jq dependency)
update_package_json() {
  local file="$1"
  local version="$2"

  if [[ ! -f "$file" ]]; then
    warn "Skipping $file (not found)"
    return
  fi

  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$file', 'utf8'));
    pkg.version = '$version';
    fs.writeFileSync('$file', JSON.stringify(pkg, null, 2) + '\n');
  "
  log "Updated $(basename "$(dirname "$file")")/$(basename "$file") -> $version"
}

# Update frontend .env with VITE_APP_VERSION
update_frontend_env() {
  local version="$1"
  local date_stamp="$2"
  local env_file="$PROJECT_ROOT/frontend/.env"

  local version_string="${version} (${date_stamp})"

  if [[ -f "$env_file" ]]; then
    if grep -q "^VITE_APP_VERSION=" "$env_file"; then
      sed -i "s|^VITE_APP_VERSION=.*|VITE_APP_VERSION=${version_string}|" "$env_file"
    else
      echo "VITE_APP_VERSION=${version_string}" >> "$env_file"
    fi
  else
    echo "VITE_APP_VERSION=${version_string}" > "$env_file"
  fi
  log "Updated frontend/.env VITE_APP_VERSION -> $version_string"
}

main() {
  [[ $# -lt 1 ]] && usage
  [[ "$1" == "-h" || "$1" == "--help" ]] && usage

  local bump_input="$1"
  shift

  # Parse flags
  local create_tag=true
  local create_commit=true
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-tag)    create_tag=false ;;
      --no-commit) create_commit=false; create_tag=false ;;
      *)           die "Unknown option: $1" ;;
    esac
    shift
  done

  # Determine new version
  local current_version new_version
  current_version="$(get_current_version)"
  validate_semver "$current_version"
  log "Current version: $current_version"

  case "$bump_input" in
    major|minor|patch)
      new_version="$(bump_version "$current_version" "$bump_input")"
      ;;
    *)
      validate_semver "$bump_input"
      new_version="$bump_input"
      ;;
  esac

  if [[ "$new_version" == "$current_version" ]]; then
    die "New version ($new_version) is the same as current version"
  fi

  # Date stamp (DD.M.YYYY format matching existing convention)
  local date_stamp
  date_stamp="$(date +'%d.%-m.%Y')"

  log "Bumping: $current_version -> $new_version ($date_stamp)"
  echo ""

  # 1. Update VERSION file
  echo "$new_version" > "$VERSION_FILE"
  log "Updated VERSION -> $new_version"

  # 2. Update package.json files
  update_package_json "$PROJECT_ROOT/backend/package.json" "$new_version"
  update_package_json "$PROJECT_ROOT/frontend/package.json" "$new_version"

  # 3. Update frontend .env with version + date stamp
  update_frontend_env "$new_version" "$date_stamp"

  echo ""

  # 4. Git commit and tag
  if [[ "$create_commit" == true ]]; then
    # Check for clean working tree (aside from our changes)
    if ! git -C "$PROJECT_ROOT" diff --quiet --exit-code -- \
      ':!VERSION' ':!backend/package.json' ':!frontend/package.json' \
      ':!frontend/.env' ':!frontend/package-lock.json' ':!backend/package-lock.json'; then
      warn "Working tree has uncommitted changes beyond version files"
      warn "Commit or stash them first, or use --no-commit"
      die "Aborting to avoid mixing version bump with other changes"
    fi

    git -C "$PROJECT_ROOT" add \
      VERSION \
      backend/package.json \
      frontend/package.json \
      frontend/.env

    # Also stage lock files if they changed
    for lockfile in backend/package-lock.json frontend/package-lock.json; do
      if git -C "$PROJECT_ROOT" diff --quiet "$lockfile" 2>/dev/null; then
        :
      else
        git -C "$PROJECT_ROOT" add "$lockfile" 2>/dev/null || true
      fi
    done

    git -C "$PROJECT_ROOT" commit -m "chore: bump version to v${new_version}"
    ok "Created commit: chore: bump version to v${new_version}"
  fi

  if [[ "$create_tag" == true ]]; then
    local tag_name="v${new_version}"
    if git -C "$PROJECT_ROOT" tag -l "$tag_name" | grep -q .; then
      die "Tag $tag_name already exists. Delete it first or choose a different version."
    fi
    git -C "$PROJECT_ROOT" tag -a "$tag_name" -m "Release ${new_version} (${date_stamp})"
    ok "Created tag: $tag_name"
  fi

  echo ""
  ok "Version updated: $current_version -> $new_version"
  echo ""
  echo "  VERSION file:     $new_version"
  echo "  Display version:  $new_version ($date_stamp)"
  if [[ "$create_tag" == true ]]; then
    echo "  Git tag:          v${new_version} (created)"
  else
    echo "  Git tag:          skipped"
  fi
  echo ""

  if [[ "$create_tag" == true ]]; then
    echo "  To push the tag:  git push origin v${new_version}"
  fi
}

main "$@"
