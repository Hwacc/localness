#!/bin/sh
# Print markdown notes for $GITHUB_REF_NAME vs the previous v*.*.* tag.
set -eu

tag="${GITHUB_REF_NAME:-}"
if [ -z "$tag" ]; then
  echo "GITHUB_REF_NAME is empty" >&2
  exit 1
fi

prev=$(
  git tag --list 'v*.*.*' --sort=-version:refname \
    | awk -v cur="$tag" '$0 != cur { print; exit }'
)

echo "## ${tag}"
echo
if [ -n "$prev" ]; then
  echo "Changes since ${prev}:"
  echo
  git log --no-merges \
    --invert-grep --grep='^chore: set package.json version' \
    --pretty=format:'- %s (%h)' "${prev}..${tag}"
  echo
else
  echo "First tagged release."
  echo
  git log --no-merges \
    --invert-grep --grep='^chore: set package.json version' \
    --pretty=format:'- %s (%h)' "$tag"
  echo
fi
echo
echo "Full history: https://github.com/${GITHUB_REPOSITORY}/releases/tag/${tag}"
