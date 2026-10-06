#!/usr/bin/env bash
# Creates the labels, issues and (optionally) the project board for esports-live in one go.
# Source of truth: docs/issues/labels.tsv, docs/issues/manifest.tsv and docs/issues/*.md.
# Idempotent: labels are upserted, and issues whose exact title already exists are skipped.
#
# Usage:  bash scripts/github-setup.sh [owner/repo]
# Needs:  gh (https://cli.github.com) authenticated via `gh auth login`.
#         For the project board also: gh auth refresh -s project
set -euo pipefail

REPO="${1:-fichin/Cs2-Project}"
OWNER="${REPO%%/*}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ISSUES_DIR="$ROOT/docs/issues"

command -v gh >/dev/null || { echo "gh is not installed: https://cli.github.com" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated: run 'gh auth login'" >&2; exit 1; }

echo "== Labels"
while IFS=$'\t' read -r name color description; do
  [ -z "$name" ] && continue
  gh label create "$name" --repo "$REPO" --color "$color" --description "$description" --force >/dev/null
  echo "  ok  $name"
done < "$ISSUES_DIR/labels.tsv"

echo "== Issues"
existing="$(gh issue list --repo "$REPO" --state all --limit 500 --json title --jq '.[].title')"
urls=()
while IFS=$'\t' read -r file title labels; do
  [ -z "$file" ] && continue
  if grep -Fxq -- "$title" <<<"$existing"; then
    url="$(gh issue list --repo "$REPO" --state all --limit 500 --json title,url \
      --jq ".[] | select(.title == \"${title//\"/\\\"}\") | .url" | head -1)"
    echo "  skip (exists)  $title"
  else
    url="$(gh issue create --repo "$REPO" --title "$title" --body-file "$ISSUES_DIR/$file" --label "$labels")"
    echo "  created  $url  $title"
  fi
  urls+=("$url")
done < "$ISSUES_DIR/manifest.tsv"

echo "== Project board"
if ! gh auth status 2>&1 | grep -q "'project'"; then
  echo "  skipped: token lacks the 'project' scope. Run: gh auth refresh -s project   then re-run this script."
  exit 0
fi

number="$(gh project list --owner "$OWNER" --format json --jq '.projects[] | select(.title == "esports-live") | .number' | head -1)"
if [ -z "$number" ]; then
  number="$(gh project create --owner "$OWNER" --title "esports-live" --format json --jq '.number')"
  echo "  created project #$number"
else
  echo "  using existing project #$number"
fi

# Rename the built-in Status options to Backlog / In progress / In review / Done.
field_id="$(gh project field-list "$number" --owner "$OWNER" --format json --jq '.fields[] | select(.name == "Status") | .id')"
if gh api graphql -f fieldId="$field_id" -f query='
  mutation($fieldId: ID!) {
    updateProjectV2Field(input: {
      fieldId: $fieldId,
      singleSelectOptions: [
        {name: "Backlog",     color: GRAY,   description: "Not started"},
        {name: "In progress", color: YELLOW, description: "Being worked on"},
        {name: "In review",   color: BLUE,   description: "PR open"},
        {name: "Done",        color: GREEN,  description: "Merged"}
      ]
    }) { projectV2Field { ... on ProjectV2SingleSelectField { id } } }
  }' >/dev/null 2>&1; then
  echo "  Status columns: Backlog, In progress, In review, Done"
else
  echo "  could not update Status options via API; rename them in the project settings UI"
fi

for url in "${urls[@]}"; do
  gh project item-add "$number" --owner "$OWNER" --url "$url" >/dev/null && echo "  added $url"
done

echo "Done. Open the project, add a Board layout grouped by Status if it shows as a table:"
gh project view "$number" --owner "$OWNER" --format json --jq '.url'
