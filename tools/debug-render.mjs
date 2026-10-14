/** Temporary diagnostic: renders one packaged visual with the grouped data shape
 * and prints the ctx summary injected into the bundle at the call site. */
import fs from "node:fs";
import glob from "node:fs";
import { JSDOM } from "jsdom";
import path from "node:path";

const slug = process.argv[2] || "sankey";
const pkg = fs.readdirSync(`visuals/${slug}/dist`).find((name) => name.endsWith(".pbiviz"));
const zipPath = `visuals/${slug}/dist/${pkg}`;

// tiny zip reader: shell out to python for the extraction
import { execFileSync } from "node:child_process";
const json = execFileSync("python3", [
    "-c",
    `import json,zipfile,sys
z=zipfile.ZipFile(${JSON.stringify(zipPath)})
name=[n for n in z.namelist() if n.endswith('.pbiviz.json')][0]
print(json.loads(z.read(name))['content']['js'])`
]).toString();
void glob;

const patched = json.replace(
    /this\.collectFlows\((\w+)\);/,
    (match, ctxVar) =>
        match +
        `this.root.setAttribute("data-dbg", JSON.stringify({cats:${ctxVar}.cats.length,series:${ctxVar}.series.length,groups:${ctxVar}.groups.length,tableGroups:${ctxVar}.tableGroups.length,roles:${ctxVar}.series.map(function(s){return s.role + ":" + s.groupName + ":" + (s.values[0] === null ? "null" : s.values[0]);})}));`
);

const dom = new JSDOM(`<!doctype html><html><body><div id="root" style="width:900px;height:520px"></div></body></html>`, { pretendToBeVisual: true });
const { window } = dom;
if (!window.PointerEvent) {
    window.PointerEvent = window.MouseEvent;
}
globalThis.window = window;
globalThis.document = window.document;
const element = window.document.getElementById("root");
window.powerbi = { visuals: { plugins: {} } };
globalThis.powerbi = window.powerbi;

const CATEGORIES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const GROUPS = ["Varejo", "Atacado", "Digital"];
const values = [];
for (const group of GROUPS) {
    values.push({
        source: { displayName: "Receita", queryName: `Vendas.measure.${group}`, roles: { measure: true }, format: "R$ #,##0.00", groupName: group },
        values: CATEGORIES.map((_unused, index) => Math.round(1000 * Math.pow(index + 1, 1.3) * (group === "Varejo" ? 1 : 0.5))),
        groupName: group
    });
}
const dataView = {
    metadata: { columns: values.map((column) => column.source) },
    categorical: {
        categories: [
            {
                source: { displayName: "Estado", queryName: "Vendas.Estado", roles: { category: true } },
                values: CATEGORIES.slice(),
                identity: CATEGORIES.map(() => ({}))
            }
        ],
        values
    }
};

const host = {
    instanceId: "dbg",
    locale: "pt-BR",
    colorPalette: { getColor: () => ({ value: "#4C8DFF" }) },
    createSelectionManager: () => ({ select: () => Promise.resolve([]), clear: () => Promise.resolve({}), showContextMenu: () => Promise.resolve({}), hasSelection: () => false, getSelectionIds: () => [], registerOnSelectCallback() {} }),
    createSelectionIdBuilder: () => ({ withCategory() { return this; }, withTable() { return this; }, createSelectionId: () => ({ getKey: () => "k" }) }),
    applyJsonFilter: () => {},
    tooltipService: { enabled: () => true, show() {}, move() {}, hide() {} },
    eventService: { renderingStarted() {}, renderingFinished() {}, renderingFailed: (o, e) => console.log("RENDER_FAILED", e) },
    persistProperties() {},
    refreshHostData() {},
    telemetry: { trace() {} },
    createLocalizationManager: () => ({ getDisplayName: (key) => key })
};

new Function(patched)();
const plugin = Object.values(window.powerbi.visuals.plugins)[0];
const visual = plugin.create({ element, host });
try {
    visual.update({ viewport: { width: 900, height: 520 }, dataViews: [dataView], type: 2, viewMode: 0 });
} catch (error) {
    console.log("THROWN", error && error.stack);
}
try {
    visual.render({ viewport: { width: 900, height: 520 }, dataViews: [dataView], type: 2, viewMode: 0 });
} catch (error) {
    console.log("RENDER_STACK", error && error.stack);
}
console.log("DBG:", element.getAttribute("data-dbg"));
console.log("TEXT:", (element.textContent || "").slice(0, 200));
console.log("NODES:", element.querySelectorAll("*").length);
void path;
