#!/usr/bin/env python3
"""Prepares the public site: copies each packaged bundle + stylesheet out of the
.pbiviz files and writes the manifest the page uses to build live demos.

Run from the repo root (after tools/build.sh and tools/verify.py):
    python3 tools/make_site.py
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[1]
VISUALS = ROOT / "visuals"
PUBLIC = ROOT / "public"
MAPPING_KIND = {"matrixheat": "grouped", "horizon": "grouped", "sankey": "grouped"}

MEASURE_LABELS = {
    "measure": "Receita",
    "measure2": "Volume",
    "measure3": "Margem",
    "start": "Valor inicial",
    "end": "Valor final",
}
MEASURE_FORMATS = {"measure": "R$ #,##0.00", "measure2": "#,##0", "measure3": "#,##0.00", "start": "R$ #,##0.00", "end": "R$ #,##0.00"}

SUBTITLES = {
    "dumbbell": "Planejado contra realizado, ordenado pela maior diferença.",
    "ring": "Participação de cada estado no total, com o KPI no centro.",
    "dotmatrix": "Uma célula por estado: quanto mais pontos acesos, maior o valor.",
    "matrixheat": "Estado x canal: a cor mostra a intensidade da receita.",
    "horizon": "Três anos de receita comprimidos em faixas, positiva para cima.",
    "radar": "Receita, volume e margem no mesmo perfil normalizado.",
    "sankey": "Como o volume sai dos estados e chega aos canais.",
    "glyph": "Cada linha desenha a própria variação entre início e fim.",
    "slicer": "Clique para filtrar: os outros visuais da página reagem na hora.",
    "sqlfilter": "A consulta vira interface: clique numa linha para somar um predicado.",
    "game": "Bônus: o dado sorteia uma categoria e você tenta acertar o valor.",
}


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)
    bundles_dir = PUBLIC / "bundles"
    if bundles_dir.exists():
        shutil.rmtree(bundles_dir)
    bundles_dir.mkdir(parents=True, exist_ok=True)

    report_path = PUBLIC / "verify-report.json"
    report = {record["slug"]: record for record in json.loads(report_path.read_text())} if report_path.exists() else {}

    styles: list[str] = []
    manifest = []

    for directory in sorted(VISUALS.iterdir()):
        if not directory.is_dir():
            continue
        slug = directory.name
        packages = sorted((directory / "dist").glob("*.pbiviz"))
        if not packages:
            print(f"!! {slug}: package missing")
            continue
        package = packages[0]
        scratch = ROOT / "tools" / ".extract" / slug
        if scratch.exists():
            shutil.rmtree(scratch)
        scratch.mkdir(parents=True, exist_ok=True)
        shutil.unpack_archive(str(package), str(scratch), "zip")
        resource = next((scratch / "resources").glob("*.pbiviz.json"))
        payload = json.loads(resource.read_text())
        (bundles_dir / f"{slug}.js").write_text(payload["content"]["js"])
        styles.append(f"/* {slug} */\n{payload['content'].get('css', '')}")
        shutil.rmtree(scratch)

        capabilities = json.loads((directory / "capabilities.json").read_text())
        pbiviz = json.loads((directory / "pbiviz.json").read_text())
        roles = capabilities["dataRoles"]
        measure_roles = [role["name"] for role in roles if role["kind"] == "Measure"]
        category_roles = [role["name"] for role in roles if role["kind"] == "Grouping"]
        card_name = None
        card_props: list[str] = []
        for name, definition in capabilities["objects"].items():
            if name == "presentation":
                continue
            card_name = name
            card_props = list(definition["properties"].keys())

        record = report.get(slug, {})
        manifest.append(
            {
                "slug": slug,
                "guid": payload["visual"]["guid"],
                "displayName": pbiviz["visual"]["displayName"],
                "description": pbiviz["visual"]["description"],
                "subtitle": SUBTITLES.get(slug, ""),
                "apiVersion": payload.get("apiVersion"),
                "bytes": package.stat().st_size,
                "sha256": hashlib.sha256(package.read_bytes()).hexdigest()[:16],
                "roles": [{"name": role["name"], "kind": role["kind"]} for role in roles],
                "categoryRoles": category_roles,
                "measureRoles": measure_roles,
                "mapping": MAPPING_KIND.get(slug, "categorical"),
                "card": {"name": card_name, "properties": card_props},
                "measures": [
                    {"role": role, "name": MEASURE_LABELS.get(role, role), "format": MEASURE_FORMATS.get(role, "#,##0.00")}
                    for role in measure_roles
                ],
                "verify": {
                    "ok": bool(record.get("ok")),
                    "nodes": record.get("nodes"),
                    "resizedNodes": record.get("resizedNodes"),
                    "emptyStateNodes": record.get("emptyStateNodes"),
                    "formattingCards": record.get("formattingCards"),
                    "formattingSlices": record.get("formattingSlices"),
                    "tooltipsShown": record.get("tooltipsShown"),
                    "selections": record.get("selections"),
                    "contextMenus": record.get("contextMenus"),
                    "filtersApplied": len(record.get("filtersApplied") or []),
                    "renderErrors": record.get("renderErrorsAfterEdgeCases") or record.get("renderErrors") or [],
                },
            }
        )

    (PUBLIC / "bundles.css").write_text("\n\n".join(styles))
    (PUBLIC / "manifest.js").write_text(
        "/* Generated by tools/make_site.py — do not edit by hand. */\nwindow.TALOS_VISUALS = "
        + json.dumps(manifest, ensure_ascii=False, indent=2)
        + ";\n"
    )
    total = sum(item["bytes"] for item in manifest)
    print(f"site manifest: {len(manifest)} visuals, {total} bytes of .pbiviz, bundles written to public/bundles/")
    for item in manifest:
        print(f"  {item['slug']:11} {item['bytes']:>6} bytes  {item['mapping']:11} verified={item['verify']['ok']}")


if __name__ == "__main__":
    main()
