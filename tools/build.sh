#!/usr/bin/env bash
# Packages every visual with the official Microsoft tool (pbiviz) and copies the
# .pbiviz files to public/downloads with predictable names.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p public/downloads
mkdir -p tools/logs

FAILED=()
for dir in visuals/*/; do
    slug="$(basename "$dir")"
    echo "=== packaging $slug"
    if (cd "$dir" && npx pbiviz package >"$ROOT/tools/logs/$slug.log" 2>&1); then
        pkg="$(ls -t "$dir"/dist/*.pbiviz | head -1)"
        cp "$pkg" "public/downloads/talos-$slug.pbiviz"
        echo "    ok -> public/downloads/talos-$slug.pbiviz ($(stat -c%s "$pkg") bytes)"
    else
        FAILED+=("$slug")
        echo "    FAILED (see tools/logs/$slug.log)"
        tail -20 "$ROOT/tools/logs/$slug.log"
    fi
done

if [ ${#FAILED[@]} -gt 0 ]; then
    echo "failed: ${FAILED[*]}"
    exit 1
fi
echo "all visuals packaged"
ls -la public/downloads
