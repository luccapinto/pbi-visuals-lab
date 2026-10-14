/**
 * Headless verification harness for the Talos visual pack.
 *
 * Loads each packaged bundle in jsdom, fakes the Power BI host contract
 * (selection, tooltips, filters, events) and drives a real update() plus a
 * resize + an empty-data pass, reporting what actually happened.
 *
 * Usage: node tools/harness.mjs <specs.json> <out.json>
 */

import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const [, , specsPath, outPath] = process.argv;
const specs = JSON.parse(fs.readFileSync(specsPath, "utf8"));

const CATEGORIES = [
    "São Paulo",
    "Rio de Janeiro",
    "Minas Gerais",
    "Paraná",
    "Bahia",
    "Santa Catarina",
    "Pernambuco",
    "Rio Grande do Sul",
    "Ceará",
    "Goiás",
    "Pará",
    "Amazonas"
];
const GROUPS = ["Varejo", "Atacado", "Digital"];
const PLANNED = "Planejado";
const REALIZED = "Realizado";

function valueFor(index, base, growth) {
    return Math.round(base * Math.pow(index + 1, growth));
}

function measureColumns(roles, rows) {
    // One numeric column per requested measure role.
    return roles.map((role, position) => {
        const values = [];
        for (let index = 0; index < rows; index++) {
            const base = position === 0 ? 1450 : position === 1 ? 980 : 640;
            values.push(valueFor(index, base, 1.32 + position * 0.06));
        }
        return {
            source: {
                displayName: role === "measure2" ? "Volume" : role === "measure3" ? "Margem" : role === "start" ? "Valor inicial" : role === "end" ? "Valor final" : "Receita",
                queryName: `Vendas.${role}`,
                roles: { [role]: true },
                format: position === 0 ? "R$ #,##0.00" : "#,##0"
            },
            values
        };
    });
}

function buildCategorical(spec) {
    const rows = CATEGORIES.length;
    const values = measureColumns(spec.measureRoles, rows);
    return {
        metadata: { columns: values.map((column) => column.source) },
        categorical: {
            categories: [
                {
                    source: { displayName: "Estado", queryName: "Vendas.Estado", roles: { [spec.categoryRoles[0]]: true } },
                    values: CATEGORIES.slice(),
                    identity: CATEGORIES.map(() => ({}))
                }
            ],
            values
        }
    };
}

function buildGrouped(spec) {
    const rows = CATEGORIES.length;
    const values = [];
    const base = measureColumns(spec.measureRoles, rows);
    for (const group of GROUPS) {
        for (const column of base) {
            values.push({
                source: {
                    displayName: column.source.displayName,
                    queryName: `${column.source.queryName}.${group}`,
                    roles: { ...column.source.roles },
                    format: column.source.format,
                    groupName: group
                },
                values: column.values.map((value) => Math.round(value * (group === "Varejo" ? 1 : group === "Atacado" ? 0.55 : 0.32))),
                groupName: group
            });
        }
    }
    return {
        metadata: { columns: values.map((column) => column.source) },
        categorical: {
            categories: [
                {
                    source: { displayName: "Estado", queryName: "Vendas.Estado", roles: { [spec.categoryRoles[0]]: true } },
                    values: CATEGORIES.slice(),
                    identity: CATEGORIES.map(() => ({}))
                }
            ],
            values
        }
    };
}

function buildTable(spec) {
    const columns = [];
    const groupNames = spec.categoryRoles;
    groupNames.forEach((role, index) => {
        columns.push({
            displayName: index === 0 ? "Estado" : "Canal",
            queryName: `Vendas.${role}`,
            roles: { [role]: true },
            index
        });
    });
    const measureIndex = columns.length;
    columns.push({
        displayName: "Receita",
        queryName: "Vendas.measure",
        roles: { measure: true },
        isMeasure: true,
        format: "R$ #,##0.00",
        index: measureIndex
    });
    const rows = [];
    const identities = [];
    CATEGORIES.forEach((category, categoryIndex) => {
        GROUPS.forEach((group, groupIndex) => {
            const row = new Array(columns.length).fill(null);
            row[0] = category;
            row[1] = group;
            row[measureIndex] = Math.round(valueFor(categoryIndex, 1450, 1.32) * (1 - groupIndex * 0.28));
            rows.push(row);
            identities.push({});
        });
    });
    return { metadata: { columns }, table: { columns, rows, identity: identities } };
}

function buildDataView(spec) {
    if (spec.kind === "grouped") {
        return buildGrouped(spec);
    }
    if (spec.kind === "table") {
        return buildTable(spec);
    }
    return buildCategorical(spec);
}

/** Minimal but faithful stand-in for the host the sandbox injects. */
function makeHost(dom, instanceId) {
    const log = [];
    let keyCounter = 0;
    const selectionManager = {
        callback: null,
        select(ids, multiSelect) {
            log.push({ type: "select", multiSelect: !!multiSelect });
            if (this.callback) {
                this.callback(Array.isArray(ids) ? ids : [ids]);
            }
            return Promise.resolve([]);
        },
        clear() {
            log.push({ type: "clear" });
            if (this.callback) {
                this.callback([]);
            }
            return Promise.resolve({});
        },
        showContextMenu(identity, position) {
            log.push({ type: "contextmenu", position });
            return Promise.resolve({});
        },
        hasSelection() {
            return false;
        },
        getSelectionIds() {
            return [];
        },
        registerOnSelectCallback(callback) {
            this.callback = callback;
        }
    };
    const builder = {
        withCategory() {
            return this;
        },
        withSeries() {
            return this;
        },
        withMeasure() {
            return this;
        },
        withMatrixNode() {
            return this;
        },
        withTable() {
            return this;
        },
        createSelectionId() {
            keyCounter += 1;
            const key = `id-${keyCounter}`;
            return {
                getKey() {
                    return key;
                },
                equals(other) {
                    return other && other.getKey && other.getKey() === key;
                },
                includes() {
                    return false;
                },
                getSelector() {
                    return {};
                },
                getSelectorsByColumn() {
                    return {};
                },
                hasIdentity() {
                    return true;
                }
            };
        }
    };
    const host = {
        instanceId,
        locale: "pt-BR",
        hostEnv: { isDeveloperMode: false },
        hostCapabilities: {},
        colorPalette: { getColor: () => ({ value: "#4C8DFF" }), reset() {} },
        createSelectionManager: () => selectionManager,
        createSelectionIdBuilder: () => builder,
        applyJsonFilter(filter, objectName, propertyName, action) {
            log.push({ type: "filter", column: filter && filter.target ? filter.target.column : "?", action });
        },
        tooltipService: {
            enabled: () => true,
            show: () => log.push({ type: "tooltip-show" }),
            move: () => log.push({ type: "tooltip-move" }),
            hide: () => log.push({ type: "tooltip-hide" })
        },
        eventService: {
            renderingStarted: () => log.push({ type: "rendering-started" }),
            renderingFinished: () => log.push({ type: "rendering-finished" }),
            renderingFailed: (options, error) => log.push({ type: "rendering-failed", error })
        },
        persistProperties() {},
        refreshHostData() {},
        telemetry: { instanceId, trace: () => {} },
        downloadService: {},
        launchUrl() {},
        displayWarningIcon() {},
        switchFocusModeState() {},
        fetchMoreData: () => false,
        openModalDialog: () => Promise.resolve({}),
        createLocalizationManager: () => ({ getDisplayName: (key) => key })
    };
    return { host, log, dom };
}

function countFormatting(model) {
    if (!model || !Array.isArray(model.cards)) {
        return { cards: 0, slices: 0, names: [] };
    }
    let slices = 0;
    const names = [];
    for (const card of model.cards) {
        names.push(card.displayName || card.uid);
        for (const group of card.groups || []) {
            slices += (group.slices || []).length;
        }
    }
    return { cards: model.cards.length, slices, names };
}

function dispatch(node, type, init) {
    const window = node.ownerDocument.defaultView;
    const EventCtor = type.startsWith("pointer") ? window.PointerEvent : type === "contextmenu" || type === "click" ? window.MouseEvent : window.Event;
    node.dispatchEvent(new EventCtor(type, { bubbles: true, cancelable: true, clientX: 20, clientY: 20, ...init }));
}

const results = [];

for (const spec of specs) {
    const dom = new JSDOM(`<!doctype html><html><body><div id="root" style="width:900px;height:520px"></div></body></html>`, {
        pretendToBeVisual: true
    });
    const { window } = dom;
    if (!window.PointerEvent) {
        window.PointerEvent = window.MouseEvent;
    }

    const element = window.document.getElementById("root");
    globalThis.window = window;
    globalThis.document = window.document;
    Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true, writable: true });
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.SVGElement = window.SVGElement;
    globalThis.Element = window.Element;
    globalThis.MouseEvent = window.MouseEvent;
    globalThis.PointerEvent = window.PointerEvent;
    if (!globalThis.crypto) {
        Object.defineProperty(globalThis, "crypto", { value: window.crypto, configurable: true, writable: true });
    }

    // The bundle registers itself on window.powerbi.visuals.plugins
    window.powerbi = { visuals: { plugins: {}, FormattingComponent: {}, FormattingComponentType: {} } };
    globalThis.powerbi = window.powerbi;

    const code = fs.readFileSync(spec.bundle, "utf8");
    const record = { slug: spec.slug, guid: spec.guid, kind: spec.kind };

    try {
        // eslint-disable-next-line no-new-func
        new Function(code)();
        const plugins = window.powerbi.visuals.plugins;
        const plugin = plugins[spec.guid];
        if (!plugin) {
            throw new Error(`bundle did not register plugin ${spec.guid} (found: ${Object.keys(plugins).join()})`);
        }
        record.pluginClass = plugin.class;
        record.displayName = plugin.displayName;

        const { host, log } = makeHost(dom, `inst-${spec.slug}`);
        const visual = plugin.create({ element, host });
        record.constructorOk = !!visual;

        const dataView = buildDataView(spec);
        record.dataShape = dataView.categorical
            ? {
                  categories: dataView.categorical.categories[0].values.length,
                  values: dataView.categorical.values.map((column) => ({
                      role: Object.keys(column.source.roles || {})[0],
                      group: column.source.groupName || column.groupName || null,
                      format: column.source.format || null,
                      first: column.values[0]
                  }))
              }
            : {
                  columns: (dataView.table.columns || []).map((column) => ({ name: column.displayName, role: Object.keys(column.roles || {})[0] })),
                  rows: (dataView.table.rows || []).length,
                  first: (dataView.table.rows || [])[0]
              };
        const viewport = { width: 900, height: 520 };
        visual.update({ viewport, dataViews: [dataView], type: 2, viewMode: 0 });

        record.updateOk = true;
        record.nodes = element.querySelectorAll("*").length;
        record.textLength = (element.textContent || "").length;
        record.classes = Array.from(new Set(Array.from(element.querySelectorAll("*")).map((node) => Array.from(node.classList)[0]).filter(Boolean))).slice(0, 12);

        const formatting = countFormatting(visual.getFormattingModel());
        record.formattingCards = formatting.cards;
        record.formattingSlices = formatting.slices;
        record.formattingNames = formatting.names;

        // interaction smoke test: hover, click and context menu on the first
        // three pointer targets (rows, cells, arcs, bars...)
        const targets = Array.from(element.querySelectorAll("*")).filter((node) => {
            const style = node.style || {};
            return style.cursor === "pointer" || node.tagName === "path" || node.tagName === "circle" || node.tagName === "rect";
        });
        let events = 0;
        const stride = Math.max(1, Math.floor(targets.length / 6));
        const sampled = targets.filter((_node, index) => index % stride === 0).slice(0, 6);
        for (const node of sampled) {
            dispatch(node, "pointermove");
            dispatch(node, "pointerenter");
            dispatch(node, "click", { ctrlKey: true });
            dispatch(node, "contextmenu");
            dispatch(node, "pointerleave");
            events += 5;
        }
        record.interactionTargets = targets.length;
        record.interactionsDispatched = events;

        // game visual: type a guess and submit it
        if (spec.slug === "game") {
            const input = element.querySelector("input");
            const button = element.querySelector("button");
            if (input && button) {
                input.value = "1200";
                dispatch(button, "click");
                record.gameSubmitted = true;
                record.gameText = (element.textContent || "").slice(0, 160);
            }
        }

        // slicer / query builder: rows must push a filter into the host
        if (spec.slug === "slicer" || spec.slug === "sqlfilter") {
            const row = element.querySelector(spec.slug === "slicer" ? ".tl-slicer-row" : ".tl-grid-row");
            if (row) {
                dispatch(row, "click");
                record.rowClicked = true;
            }
        }

        record.tooltipsShown = log.filter((entry) => entry.type === "tooltip-show").length;
        record.tooltipsHidden = log.filter((entry) => entry.type === "tooltip-hide").length;
        record.selections = log.filter((entry) => entry.type === "select").length;
        record.contextMenus = log.filter((entry) => entry.type === "contextmenu").length;
        record.filtersApplied = log.filter((entry) => entry.type === "filter").map((entry) => `${entry.column}:${entry.action}`);
        record.renderingFinished = log.filter((entry) => entry.type === "rendering-finished").length;
        record.renderErrors = log.filter((entry) => entry.type === "rendering-failed").map((entry) => entry.error);

        // resize pass + empty-data pass must not throw
        visual.update({ viewport: { width: 420, height: 300 }, dataViews: [dataView], type: 4, viewMode: 0 });
        record.resizedNodes = element.querySelectorAll("*").length;
        visual.update({ viewport: { width: 420, height: 300 }, dataViews: [], type: 2, viewMode: 0 });
        record.emptyStateNodes = element.querySelectorAll("*").length;
        record.emptyStateText = (element.textContent || "").slice(0, 80);
        record.renderErrorsAfterEdgeCases = log.filter((entry) => entry.type === "rendering-failed").map((entry) => entry.error);
        record.ok = record.renderErrorsAfterEdgeCases.length === 0 && record.nodes > 20;
    } catch (error) {
        record.ok = false;
        record.error = error && error.message ? error.message : String(error);
    }
    try {
        visualDestroy(dom);
    } catch (error) {
        void error;
    }
    results.push(record);
    dom.window.close();
}

function visualDestroy() {
    // Elements are dropped with the jsdom instance; nothing else to release here.
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
const failed = results.filter((entry) => !entry.ok);
console.log(`harness: ${results.length - failed.length}/${results.length} visuals rendered`);
for (const entry of results) {
    const detail = entry.ok
        ? `nodes=${entry.nodes} resized=${entry.resizedNodes} empty=${entry.emptyStateNodes} formatting=${entry.formattingCards}c/${entry.formattingSlices}s tooltips=${entry.tooltipsShown} selections=${entry.selections} ctx=${entry.contextMenus} filters=${(entry.filtersApplied || []).length}`
        : `ERROR ${entry.error || (entry.renderErrorsAfterEdgeCases || []).join(" | ")}`;
    console.log(`  ${entry.slug.padEnd(11)} ${detail}`);
}
if (failed.length) {
    process.exitCode = 1;
}
void path;
