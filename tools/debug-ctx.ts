/**
 * Data-shape diagnostic: runs the shared data adapter against a synthetic
 * dataView and prints what the visuals actually receive (categories, series,
 * grouped values, table groups). Handy when a visual shows its empty state.
 *
 * Build + run:
 *   npx esbuild tools/debug-ctx.ts --bundle --format=esm --platform=node \
 *     --alias:powerbi-visuals-api=./tools/powerbi-api-stub.js --outfile=tools/.debug-ctx.mjs
 *   node tools/.debug-ctx.mjs grouped|categorical|table
 */

import { buildCtx } from "../shared/src/kit";

const mode = process.argv[2] || "grouped";

const CATEGORIES = ["São Paulo", "Rio de Janeiro", "Minas Gerais", "Paraná", "Bahia"];
const GROUPS = ["Varejo", "Atacado", "Digital"];

const valuesFor = (position: number, rows: number): (number | null)[] =>
    Array.from({ length: rows }, (_unused, index) => Math.round(1000 * Math.pow(index + 1, 1.3) * (1 - position * 0.2)));

const categoricalValues = (rows: number) => [
    { source: { displayName: "Receita", roles: { measure: true }, format: "R$ #,##0.00" }, values: valuesFor(0, rows) }
];

const dataView: Record<string, unknown> = {
    metadata: { columns: [] },
    categorical: {
        categories: [
            {
                source: { displayName: "Estado", queryName: "Vendas.Estado", roles: { category: true } },
                values: CATEGORIES,
                identity: CATEGORIES.map(() => ({}))
            }
        ],
        values: [] as unknown[]
    }
};

if (mode === "grouped") {
    const extracted = dataView.categorical as { values: unknown[] };
    for (const group of GROUPS) {
        for (const column of categoricalValues(CATEGORIES.length)) {
            extracted.values.push({
                source: { ...column.source, groupName: group, queryName: `Vendas.measure.${group}` },
                values: column.values.map((value) => Math.round((value || 0) * (group === "Varejo" ? 1 : 0.5))),
                groupName: group
            });
        }
    }
} else if (mode === "categorical") {
    (dataView.categorical as { values: unknown[] }).values = categoricalValues(CATEGORIES.length);
} else {
    const columns = [
        { displayName: "Estado", queryName: "Vendas.Estado", roles: { category: true }, index: 0 },
        { displayName: "Canal", queryName: "Vendas.Canal", roles: { column: true }, index: 1 },
        { displayName: "Receita", queryName: "Vendas.measure", roles: { measure: true }, isMeasure: true, index: 2, format: "R$ #,##0.00" }
    ];
    const rows: (string | number)[][] = [];
    CATEGORIES.forEach((category, categoryIndex) => {
        GROUPS.forEach((group, groupIndex) => {
            rows.push([category, group, Math.round(1000 * Math.pow(categoryIndex + 1, 1.3) * (1 - groupIndex * 0.25))]);
        });
    });
    delete (dataView as { categorical?: unknown }).categorical;
    dataView.table = { columns, rows, identity: rows.map(() => ({})) };
}

const options = {
    viewport: { width: 900, height: 520 },
    dataViews: [dataView],
    type: 2,
    viewMode: 0
} as unknown as Parameters<typeof buildCtx>[0];

const ctx = buildCtx(options, {} as Parameters<typeof buildCtx>[1], {
    key: "debug",
    name: "debug",
    bg: "#000",
    card: "#111",
    fg: "#fff",
    sub: "#888",
    grid: "#222",
    accent: "#4C8DFF",
    accent2: "#25D0A5",
    palette: ["#4C8DFF", "#25D0A5", "#F2B33D"],
    mono: false,
    radius: 4
});

console.log(
    JSON.stringify(
        {
            rows: ctx.rows,
            cats: ctx.cats,
            isEmpty: ctx.isEmpty,
            series: ctx.series.map((item) => ({ role: item.role, name: item.name, group: item.groupName, first: item.values[0] })),
            groups: ctx.groups.map((group) => ({ name: group.name, series: group.series.length })),
            tableGroups: ctx.tableGroups.map((group) => ({ role: group.role, name: group.name, first: group.labels[0] })),
            identities: ctx.identities.length
        },
        null,
        2
    )
);
