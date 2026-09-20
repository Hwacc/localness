#!/bin/sh
# Set package.json "version" from a semver string (tag with or without v).
set -eu

raw="${1:-${GITHUB_REF_NAME:-}}"
if [ -z "$raw" ]; then
  echo "usage: set-package-version.sh <version>" >&2
  exit 1
fi
version="${raw#v}"

VERSION="$version" node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.version = process.env.VERSION;
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
echo "package.json version=${version}"
