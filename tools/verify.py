#!/usr/bin/env python3
"""Unpacks every packaged .pbiviz, feeds the bundles to the Node harness and
writes public/verify-report.json with what actually rendered.

Run from the repo root: python3 tools/verify.py
"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
VISUALS = ROOT / "visuals"
PUBLIC = ROOT / "public"

MAPPING_KIND = {
    # visuals whose capabilities declare more than one group role -> grouped values
    "matrixheat": "grouped",
    "horizon": "grouped",
    "sankey": "grouped",
}


def main() -> int:
    specs = []
    scratch = pathlib.Path(tempfile.mkdtemp(prefix="pbiviz-verify-"))
    for directory in sorted(VISUALS.iterdir()):
        if not directory.is_dir():
            continue
        packages = sorted((directory / "dist").glob("*.pbiviz"))
        if not packages:
            print(f"!! {directory.name}: no .pbiviz built")
            continue
        package = packages[0]
        target = scratch / directory.name
        target.mkdir(parents=True, exist_ok=True)
        shutil.unpack_archive(str(package), str(target), "zip")
        resource = next((target / "resources").glob("*.pbiviz.json"))
        payload = json.loads(resource.read_text())
        bundle = target / "bundle.js"
        bundle.write_text(payload["content"]["js"])

        capabilities = json.loads((directory / "capabilities.json").read_text())
        roles = capabilities["dataRoles"]
        category_roles = [role["name"] for role in roles if role["kind"] == "Grouping"]
        measure_roles = [role["name"] for role in roles if role["kind"] == "Measure"]

        specs.append(
            {
                "slug": directory.name,
                "guid": payload["visual"]["guid"],
                "bundle": str(bundle),
                "bytes": package.stat().st_size,
                "apiVersion": payload.get("apiVersion"),
                "categoryRoles": category_roles,
                "measureRoles": measure_roles,
                "kind": MAPPING_KIND.get(directory.name, "categorical"),
            }
        )

    specs_path = scratch / "specs.json"
    specs_path.write_text(json.dumps(specs, indent=2))
    out_path = PUBLIC / "verify-report.json"
    PUBLIC.mkdir(exist_ok=True)

    process = subprocess.run(
        ["node", str(ROOT / "tools" / "harness.mjs"), str(specs_path), str(out_path)],
        capture_output=True,
        text=True,
        cwd=str(ROOT),
    )
    print(process.stdout)
    if process.stderr.strip():
        print(process.stderr[-3000:], file=sys.stderr)

    if not out_path.exists():
        return 1

    records = json.loads(out_path.read_text())
    for record in records:
        spec = next((item for item in specs if item["slug"] == record["slug"]), {})
        record["bytes"] = spec.get("bytes")
        record["apiVersion"] = spec.get("apiVersion")
    out_path.write_text(json.dumps(records, indent=2, ensure_ascii=False))

    ok = sum(1 for record in records if record.get("ok"))
    print(f"\n{ok}/{len(records)} visuals verified -> {out_path.relative_to(ROOT)}")
    return 0 if ok == len(records) else 1


if __name__ == "__main__":
    raise SystemExit(main())
