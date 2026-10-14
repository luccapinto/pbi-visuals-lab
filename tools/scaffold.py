#!/usr/bin/env python3
"""Generates the Power BI scaffolding (pbiviz.json, capabilities.json, tsconfig,
style, icon) for every visual in the pack, from one manifest.

Run from the repo root:  python3 tools/scaffold.py
"""

from __future__ import annotations

import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
VISUALS = ROOT / "visuals"

THEME_ITEMS = [
    {"value": "xp", "displayName": "Executivo (escuro)"},
    {"value": "papel", "displayName": "Papel (claro)"},
    {"value": "neon", "displayName": "Neon (escuro)"},
    {"value": "terminal", "displayName": "Terminal (SQL)"},
]

COLOR = {"type": {"fill": {"solid": {"color": True}}}}
BOOL = {"type": {"bool": True}}
NUM = {"type": {"numeric": True}}


def enum(*items: tuple[str, str]) -> dict:
    return {"type": {"enumeration": [{"value": value, "displayName": label} for value, label in items]}}


def presentation_object() -> dict:
    return {
        "displayName": "Apresentação",
        "properties": {
            "theme": enum(*[(item["value"], item["displayName"]) for item in THEME_ITEMS]),
            "accent": COLOR,
            "accent2": COLOR,
            "decimals": NUM,
            "showValues": BOOL,
            "showLegend": BOOL,
        },
    }


def cardinality(role: str, kind: str = "Grouping") -> dict:
    return {"displayName": role, "name": role, "kind": kind}


def categorical_mapping(category_roles: list[str], measure_roles: list[str]) -> list[dict]:
    """First group role becomes the category axis; extra group roles ride along as
    grouped values (the classic Category + Series + Measure shape), and measures are
    bound straight into the values bucket."""
    if not category_roles:
        rows = [{"for": {"in": role}} for role in measure_roles]
        return [{"table": {"rows": {"select": rows}, "rowCount": {"preferred": {"min": 1, "max": 30000}}}}]
    select = [{"bind": {"to": role}} for role in measure_roles]
    select += [{"for": {"in": role}} for role in category_roles[1:]]
    return [
        {
            "categorical": {
                "categories": {
                    "for": {"in": category_roles[0]},
                    "dataReductionAlgorithm": {"top": {"count": 5000}},
                },
                "values": {"select": select},
            }
        }
    ]


VISUAL_SPECS: dict[str, dict] = {
    "dumbbell": {
        "displayName": "Dumbbell comparativo",
        "description": "Compara dois valores por categoria num eixo comum, com delta e ordenação.",
        "roles": [("category", "Grouping"), ("start", "Measure"), ("end", "Measure")],
        "measure_roles": ["start", "end"],
        "card": "dumbbell",
        "card_display": "Dumbbell",
        "card_props": {
            "labelWidth": NUM,
            "dotSize": NUM,
            "sortBy": enum(("end", "Valor final"), ("start", "Valor inicial"), ("delta", "Delta"), ("category", "Categoria")),
            "sortDirection": enum(("desc", "Decrescente"), ("asc", "Crescente")),
            "showDelta": BOOL,
        },
    },
    "ring": {
        "displayName": "Anel de participação",
        "description": "Donut de participação com KPI central, realce no hover e seleção cruzada.",
        "roles": [("category", "Grouping"), ("measure", "Measure")],
        "measure_roles": ["measure"],
        "card": "ring",
        "card_display": "Anel",
        "card_props": {
            "thickness": NUM,
            "gapDegrees": NUM,
            "showCenterKpi": BOOL,
            "maxSlices": NUM,
        },
    },
    "dotmatrix": {
        "displayName": "Grade de pontos",
        "description": "Matriz de pontos proporcional ao valor, em grade responsiva.",
        "roles": [("category", "Grouping"), ("measure", "Measure")],
        "measure_roles": ["measure"],
        "card": "dotMatrix",
        "card_display": "Grade de pontos",
        "card_props": {
            "dotsPerCell": NUM,
            "cellHeight": NUM,
            "minCellWidth": NUM,
        },
    },
    "matrixheat": {
        "displayName": "Matriz de calor",
        "description": "Heatmap linha x coluna com escala de cor, totais e maior valor destacado.",
        "roles": [("category", "Grouping"), ("column", "Grouping"), ("measure", "Measure")],
        "measure_roles": ["measure"],
        "card": "matrixHeat",
        "card_display": "Matriz de calor",
        "card_props": {
            "showRowTotals": BOOL,
            "cellGap": NUM,
            "colorMode": enum(("single", "Uma cor (intensidade)"), ("two", "Duas cores (destaque)"), ("diverging", "Divergente (zero no centro)")),
        },
    },
    "horizon": {
        "displayName": "Bandas de horizonte",
        "description": "Horizon chart: séries comprimidas em faixas sobrepostas com leitura exata no hover.",
        "roles": [("category", "Grouping"), ("series", "Grouping"), ("measure", "Measure")],
        "measure_roles": ["measure"],
        "card": "horizon",
        "card_display": "Bandas de horizonte",
        "card_props": {
            "bands": NUM,
            "bandHeight": NUM,
            "scaleMode": enum(("shared", "Comum a todas as bandas"), ("own", "Por banda")),
        },
    },
    "radar": {
        "displayName": "Radar comparativo",
        "description": "Perfis de várias medidas sobre os mesmos eixos, com legenda que liga e desliga séries.",
        "roles": [("category", "Grouping"), ("measure", "Measure"), ("measure2", "Measure"), ("measure3", "Measure")],
        "measure_roles": ["measure", "measure2", "measure3"],
        "card": "radar",
        "card_display": "Radar",
        "card_props": {
            "rings": NUM,
            "areaFill": BOOL,
            "dotSize": NUM,
        },
    },
    "sankey": {
        "displayName": "Fluxo entre origem e destino",
        "description": "Sankey com nós proporcionais, realce de caminho e seleção por fluxo.",
        "roles": [("source", "Grouping"), ("target", "Grouping"), ("measure", "Measure")],
        "measure_roles": ["measure"],
        "card": "sankey",
        "card_display": "Fluxo",
        "card_props": {
            "nodeWidth": NUM,
            "nodePadding": NUM,
            "alignment": enum(("justify", "Distribuído"), ("left", "À esquerda"), ("right", "À direita"), ("center", "Centralizado")),
        },
    },
    "glyph": {
        "displayName": "Micro-gráficos por categoria",
        "description": "Cada linha desenha seu próprio mini gráfico: partida, chegada, direção e variação.",
        "roles": [("category", "Grouping"), ("start", "Measure"), ("end", "Measure")],
        "measure_roles": ["start", "end"],
        "card": "glyph",
        "card_display": "Micro-gráficos",
        "card_props": {
            "rowHeight": NUM,
            "barScale": enum(("shared", "Comum"), ("own", "Por linha")),
        },
    },
    "slicer": {
        "displayName": "Filtro visual",
        "description": "Lista ranqueada que aplica filtro real ao relatório, com seleção múltipla.",
        "roles": [("category", "Grouping"), ("measure", "Measure")],
        "measure_roles": ["measure"],
        "card": "slicer",
        "card_display": "Filtro",
        "card_props": {
            "rowHeight": NUM,
            "showBars": BOOL,
            "showRank": BOOL,
        },
    },
    "sqlfilter": {
        "displayName": "Query builder (terminal)",
        "description": "Mostra a consulta com WHERE vivo e aplica predicados clicáveis como filtro do relatório.",
        "roles": [("category", "Grouping"), ("measure", "Measure")],
        "measure_roles": ["measure"],
        "card": "sqlFilter",
        "card_display": "Query",
        "card_props": {
            "rowHeight": NUM,
            "typeQuery": BOOL,
            "maxPredicates": NUM,
        },
    },
    "game": {
        "displayName": "Desafio · adivinhe o valor",
        "description": "Bônus interativo: o dado sorteia uma categoria e o jogador chuta o valor.",
        "roles": [("category", "Grouping"), ("measure", "Measure")],
        "measure_roles": ["measure"],
        "card": "game",
        "card_display": "Desafio",
        "card_props": {
            "rounds": NUM,
            "tolerance": NUM,
        },
    },
}

LESS = """/* Shared look for the Talos visual pack: only what inline styles cannot express. */

.tl-root {
    font-variant-numeric: tabular-nums;
    user-select: none;
}

.tl-svg text {
    font-family: inherit;
}

.tl-slicer-row:hover,
.tl-grid-row:hover {
    outline: 1px solid rgba(255, 255, 255, 0.16);
    outline-offset: -1px;
}

.tl-game-input:focus {
    border-color: rgba(255, 255, 255, 0.45);
}

.tl-game-submit:hover,
.tl-slicer-clear:hover,
.tl-game-again:hover {
    filter: brightness(1.12);
}

.tl-grid,
.tl-slicer-list {
    scrollbar-width: thin;
}

@media (prefers-reduced-motion: reduce) {
    .tl-root * {
        transition: none !important;
        animation: none !important;
    }
}
"""


def icon_for(slug: str, accent: str, background: str, path: pathlib.Path) -> None:
    """Draws a 300x300 icon: dark plate plus a motif that hints at the visual."""
    from PIL import Image, ImageDraw

    size = 300
    image = Image.new("RGB", (size, size), background)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([8, 8, size - 8, size - 8], radius=42, outline=accent, width=6)

    def dots(rows: int, cols: int, radius: int) -> None:
        for row in range(rows):
            for col in range(cols):
                cx = 80 + col * (140 / max(1, cols - 1))
                cy = 80 + row * (140 / max(1, rows - 1))
                draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=accent)

    if slug == "dumbbell":
        for index, yy in enumerate((100, 150, 200)):
            start = 70 + index * 18
            end = 210 - index * 26
            draw.line([start, yy, end, yy], fill=accent, width=8)
            draw.ellipse([start - 12, yy - 12, start + 12, yy + 12], outline=accent, width=5)
            draw.ellipse([end - 12, yy - 12, end + 12, yy + 12], fill=accent)
    elif slug == "ring":
        draw.arc([60, 60, 240, 240], start=-90, end=180, fill=accent, width=28)
        draw.arc([60, 60, 240, 240], start=190, end=320, fill="#EF6F87", width=28)
    elif slug == "dotmatrix":
        dots(4, 4, 11)
    elif slug == "matrixheat":
        for row in range(4):
            for col in range(4):
                shade = int(60 + (row * 4 + col) * 12)
                draw.rectangle([60 + col * 46, 60 + row * 46, 100 + col * 46, 100 + row * 46], fill=(shade, shade, min(255, shade + 40)))
    elif slug == "horizon":
        for index in range(4):
            draw.polygon(
                [(60, 220 - index * 40), (120, 200 - index * 40), (180, 150 - index * 40), (240, 205 - index * 40), (240, 220 - index * 40), (60, 220 - index * 40)],
                fill=accent,
            )
    elif slug == "radar":
        import math

        for scale in (1.0, 0.65, 0.3):
            points = []
            for step in range(0, 360, 72):
                angle = math.radians(step - 90)
                points.append((150 + 90 * scale * math.cos(angle), 150 + 90 * scale * math.sin(angle)))
            draw.polygon(points, outline=accent)
    elif slug == "sankey":
        draw.line([70, 90, 230, 140], fill=accent, width=16)
        draw.line([70, 160, 230, 130], fill="#EF6F87", width=12)
        draw.line([70, 210, 230, 200], fill=accent, width=8)
    elif slug == "glyph":
        for index, yy in enumerate((95, 150, 205)):
            draw.rectangle([70, yy - 8, 70 + 60 + index * 30, yy + 8], fill=accent)
            draw.line([70 + 70 + index * 30, yy - 18, 70 + 70 + index * 30, yy + 18], fill="#FFFFFF", width=4)
    elif slug == "slicer":
        for index, yy in enumerate((95, 145, 195)):
            draw.rectangle([60, yy - 10, 240 - index * 40, yy + 10], fill=accent if index == 0 else (70, 70, 70))
    elif slug == "sqlfilter":
        draw.rectangle([55, 70, 245, 230], outline=accent, width=6)
        draw.line([78, 110, 150, 110], fill=accent, width=8)
        draw.line([78, 150, 220, 150], fill=accent, width=8)
        draw.line([78, 190, 130, 190], fill=accent, width=8)
    elif slug == "game":
        draw.rounded_rectangle([70, 70, 230, 230], radius=24, outline=accent, width=8)
        for cx, cy in ((115, 115), (185, 115), (115, 185), (185, 185), (150, 150)):
            draw.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=accent)
    else:
        dots(3, 3, 14)

    image.save(path)


def theme_colors(slug: str) -> tuple[str, str]:
    accent = {"terminal": "#35FF8C", "neon": "#7C5CFF", "papel": "#2456E6", "game": "#FFD166"}.get(slug, "#4C8DFF")
    background = "#0B1220" if slug != "papel" else "#F6F7F9"
    return accent, background


def main() -> None:
    written = []
    for slug, spec in VISUAL_SPECS.items():
        directory = VISUALS / slug
        (directory / "src").mkdir(parents=True, exist_ok=True)
        (directory / "assets").mkdir(parents=True, exist_ok=True)
        (directory / "style").mkdir(parents=True, exist_ok=True)

        guid = slug + hashlib.md5(slug.encode()).hexdigest().upper()[:32]
        pbiviz = {
            "visual": {
                "name": slug,
                "displayName": spec["displayName"],
                "guid": guid,
                "visualClassName": "Visual",
                "version": "1.0.0.0",
                "description": spec["description"],
                "supportUrl": "https://pbi-visuals-lab.luccabuilds.com",
                "gitHubUrl": "https://github.com/luccapinto/pbi-visuals-lab",
            },
            "apiVersion": "5.11.1",
            "author": {"name": "Lucca Pinto", "email": "luccapinto@users.noreply.github.com"},
            "assets": {"icon": "assets/icon.png"},
            "externalJS": None,
            "style": "style/visual.less",
            "capabilities": "capabilities.json",
            "dependencies": None,
            "stringResources": [],
            "version": "1.0.0.0",
        }
        (directory / "pbiviz.json").write_text(json.dumps(pbiviz, indent=4) + "\n")

        roles = [cardinality(name, kind) for name, kind in spec["roles"]]
        category_roles = [name for name, kind in spec["roles"] if kind == "Grouping"]
        objects = {"presentation": presentation_object()}
        if spec["card"] != "presentation":
            objects[spec["card"]] = {
                "displayName": spec["card_display"],
                "properties": dict(spec["card_props"]),
            }
        capabilities = {
            "dataRoles": roles,
            "objects": objects,
            "dataViewMappings": categorical_mapping(category_roles, spec["measure_roles"]),
            "privileges": [],
        }
        (directory / "capabilities.json").write_text(json.dumps(capabilities, indent=4) + "\n")

        tsconfig = {
            "compilerOptions": {
                "allowJs": False,
                "emitDecoratorMetadata": True,
                "experimentalDecorators": True,
                "target": "es2022",
                "sourceMap": True,
                "outDir": "./.tmp/build/",
                "moduleResolution": "node",
                "declaration": True,
                "lib": ["es2022", "dom"],
            },
            "files": ["./src/visual.ts"],
        }
        (directory / "tsconfig.json").write_text(json.dumps(tsconfig, indent=4) + "\n")
        (directory / "style" / "visual.less").write_text(LESS)

        accent, background = theme_colors(slug)
        icon_for(slug, accent, background, directory / "assets" / "icon.png")
        written.append(slug)

    print(f"scaffolded {len(written)} visuals: {', '.join(written)}")


if __name__ == "__main__":
    main()
