/**
 * Talos Power BI visual kit shared by every visual in this repo.
 * Type-only usage of the powerbi namespace: nothing here touches window.powerbi at runtime.
 * (The global object is provided by the host sandbox and exposed by the Power BI library shim.)
 */

import powerbi from "powerbi-visuals-api";

import { el, clear, svgEl, styled, append } from "./dom";

export type PrimitiveValue = string | number | boolean | Date | null | undefined;

/** The concrete host the sandbox passes to a visual (has selection, tooltip, filters). */
export type Host = powerbi.extensibility.visual.IVisualHost;
/** Selection identities handed back by the host always implement the visuals contract. */
export type SelId = powerbi.visuals.ISelectionId;

export function asSelId(value: unknown): SelId | null {
    return value ? (value as SelId) : null;
}

/* ------------------------------------------------------------------ themes */

export interface Theme {
    key: string;
    name: string;
    bg: string;
    card: string;
    fg: string;
    sub: string;
    grid: string;
    accent: string;
    accent2: string;
    palette: string[];
    mono: boolean;
    radius: number;
}

export const THEMES: Theme[] = [
    {
        key: "xp",
        name: "Executivo (escuro)",
        bg: "#0B1220",
        card: "#121C2E",
        fg: "#E8EEF7",
        sub: "#8DA0B9",
        grid: "#1E2C44",
        accent: "#4C8DFF",
        accent2: "#25D0A5",
        palette: ["#4C8DFF", "#25D0A5", "#F2B33D", "#EF6F87", "#9B8CFF", "#3FBFDD", "#F08A4B", "#8FD14F"],
        mono: false,
        radius: 6
    },
    {
        key: "papel",
        name: "Papel (claro)",
        bg: "#F6F7F9",
        card: "#FFFFFF",
        fg: "#131922",
        sub: "#69707D",
        grid: "#E3E6EB",
        accent: "#2456E6",
        accent2: "#D9542B",
        palette: ["#2456E6", "#D9542B", "#178F5B", "#B58900", "#7A4FD1", "#0E7C99", "#C1318A", "#5C6B7A"],
        mono: false,
        radius: 6
    },
    {
        key: "neon",
        name: "Neon (escuro)",
        bg: "#07070E",
        card: "#12121F",
        fg: "#F1F2FF",
        sub: "#7C7FA5",
        grid: "#22224A",
        accent: "#7C5CFF",
        accent2: "#20E3C0",
        palette: ["#7C5CFF", "#20E3C0", "#FF6BD6", "#FFD166", "#4CC9F0", "#F26B4E", "#9BFF6B", "#C0B6FF"],
        mono: false,
        radius: 10
    },
    {
        key: "terminal",
        name: "Terminal (SQL)",
        bg: "#080C09",
        card: "#0F160F",
        fg: "#D3FFDA",
        sub: "#5E8A66",
        grid: "#1A2A1C",
        accent: "#35FF8C",
        accent2: "#FFD166",
        palette: ["#35FF8C", "#7BD3FF", "#FFD166", "#FF8FA3", "#C6A0FF", "#9EFF6B", "#FFA35C", "#67E8F9"],
        mono: true,
        radius: 3
    }
];

export function themeByKey(key: string): Theme {
    for (const theme of THEMES) {
        if (theme.key === key) {
            return theme;
        }
    }
    return THEMES[0];
}

/* --------------------------------------------------------------- numbers */

export function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * clamp(t, 0, 1);
}

/** Accepts the shapes Power BI can hand back for a value / formatting property. */
export function toNumber(value: PrimitiveValue | { value?: unknown } | { solid?: { color?: string } }): number | null {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === "number") {
        return isFinite(value) ? value : null;
    }
    if (typeof value === "boolean") {
        return value ? 1 : 0;
    }
    if (value instanceof Date) {
        return value.getTime();
    }
    if (typeof value === "string") {
        const cleaned = value.trim().replace(/\s/g, "");
        if (!cleaned || cleaned === "-") {
            return null;
        }
        const normalized = cleaned.indexOf(",") >= 0 ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
        const parsed = Number(normalized.replace(/[^0-9eE+\-.]/g, ""));
        return isFinite(parsed) ? parsed : null;
    }
    return null;
}

export function toText(value: PrimitiveValue): string {
    if (value === null || value === undefined) {
        return "";
    }
    if (value instanceof Date) {
        return `${pad2(value.getDate())}/${pad2(value.getMonth() + 1)}/${value.getFullYear()}`;
    }
    return String(value);
}

export function pad2(value: number): string {
    return value < 10 ? `0${value}` : String(value);
}

export interface NumberFormat {
    format?: string;
    decimals?: number;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatDate(value: PrimitiveValue, mode: string): string {
    const date = value instanceof Date ? value : new Date(String(value));
    if (isNaN(date.getTime())) {
        return toText(value);
    }
    switch (mode) {
        case "day":
            return `${pad2(date.getDate())}`;
        case "month":
            return MONTHS[date.getMonth()];
        case "month-year":
            return `${MONTHS[date.getMonth()]}/${pad2(date.getFullYear() % 100)}`;
        case "year":
            return String(date.getFullYear());
        case "month-name":
            return MONTHS[date.getMonth()];
        default:
            return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
    }
}

export function formatNumber(value: number | null, options?: NumberFormat): string {
    if (value === null || value === undefined || !isFinite(value)) {
        return "—";
    }
    const decimals = options && options.decimals !== undefined && options.decimals !== null ? options.decimals : 2;
    const style = detectStyle(options ? options.format : undefined);
    const fractionDigits = style === "percent" ? decimals + 1 : decimals;
    try {
        return new Intl.NumberFormat("pt-BR", {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
            style: style === "currency" ? "currency" : style === "percent" ? "percent" : "decimal",
            currency: style === "currency" ? "BRL" : undefined
        }).format(value);
    } catch (error) {
        return value.toFixed(fractionDigits);
    }
}

function detectStyle(format?: string): "decimal" | "percent" | "currency" {
    const text = (format || "").toLowerCase();
    if (text.indexOf("%") >= 0) {
        return "percent";
    }
    if (text.indexOf("r$") >= 0 || text.indexOf("$") >= 0 || text.indexOf("brl") >= 0) {
        return "currency";
    }
    return "decimal";
}

export function formatCompact(value: number | null, decimals?: number): string {
    if (value === null || value === undefined || !isFinite(value)) {
        return "—";
    }
    const abs = Math.abs(value);
    const digits = decimals === undefined ? (abs >= 100 ? 0 : abs >= 10 ? 1 : 2) : decimals;
    const units: { limit: number; suffix: string; scale: number }[] = [
        { limit: 1e12, suffix: "T", scale: 1e12 },
        { limit: 1e9, suffix: "bi", scale: 1e9 },
        { limit: 1e6, suffix: "mi", scale: 1e6 },
        { limit: 1e3, suffix: "mil", scale: 1e3 }
    ];
    for (const unit of units) {
        if (abs >= unit.limit) {
            return `${(value / unit.scale).toFixed(digits).replace(".", ",")}${unit.suffix}`;
        }
    }
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(value);
}

export function axisFormatter(span: number, decimals: number): (value: number) => string {
    if (Math.abs(span) >= 100000) {
        return (value: number) => formatCompact(value, 0);
    }
    return (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: decimals }).format(value);
}

export function niceTicks(min: number, max: number, count: number): number[] {
    if (!isFinite(min) || !isFinite(max)) {
        return [0, 1];
    }
    if (min === max) {
        const base = Math.abs(min) || 1;
        min = min - base * 0.5;
        max = max + base * 0.5;
    }
    const span = max - min;
    const rawStep = span / Math.max(2, count);
    const magnitude = Math.pow(10, Math.floor(Math.log(rawStep) / Math.LN10));
    const normalized = rawStep / magnitude;
    const step = (normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1) * magnitude;
    const ticks: number[] = [];
    const start = Math.ceil(min / step) * step;
    for (let value = start; value <= max + step * 1e-6; value += step) {
        ticks.push(Math.round(value / step) * step);
        if (ticks.length > 200) {
            break;
        }
    }
    return ticks;
}

export type Scale = (value: number) => number;

export function linearScale(domainStart: number, domainEnd: number, rangeStart: number, rangeEnd: number): Scale {
    const span = domainEnd - domainStart || 1;
    return (value: number) => rangeStart + ((value - domainStart) / span) * (rangeEnd - rangeStart);
}

/* ----------------------------------------------------------------- colors */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    let text = (hex || "").replace("#", "").trim();
    if (text.length === 3) {
        text = text[0] + text[0] + text[1] + text[1] + text[2] + text[2];
    }
    const parsed = parseInt(text || "888888", 16);
    if (isNaN(parsed)) {
        return { r: 136, g: 136, b: 136 };
    }
    return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 };
}

export function rgba(hex: string, alpha: number): string {
    const rgb = hexToRgb(hex);
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${clamp(alpha, 0, 1)})`;
}

export function mixColors(a: string, b: string, t: number): string {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    const channel = (x: number, y: number) => Math.round(lerp(x, y, t));
    return `rgb(${channel(ca.r, cb.r)},${channel(ca.g, cb.g)},${channel(ca.b, cb.b)})`;
}

export function luminance(hex: string): number {
    const rgb = hexToRgb(hex);
    return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

export function contrastText(background: string, dark: string, light: string): string {
    return luminance(background) > 0.55 ? dark : light;
}

/** Stable color for an arbitrary key (category, source, target...). */
export function colorForKey(key: string, palette: string[]): string {
    let hash = 0;
    for (let index = 0; index < key.length; index++) {
        hash = (hash * 31 + key.charCodeAt(index)) % 100000;
    }
    return palette[hash % palette.length];
}

/* ------------------------------------------------------------------ settings */

/** Formatting pane value readers: tolerate every shape Power BI hands back. */
export function optColor(value: unknown, fallback: string): string {
    if (!value) {
        return fallback;
    }
    if (typeof value === "string") {
        return value || fallback;
    }
    const container = value as { value?: unknown; solid?: { color?: string } };
    if (typeof container.value === "string" && container.value) {
        return container.value;
    }
    if (container.solid && typeof container.solid.color === "string" && container.solid.color) {
        return container.solid.color;
    }
    return fallback;
}

export function optBool(value: unknown, fallback: boolean): boolean {
    if (value === null || value === undefined) {
        return fallback;
    }
    if (typeof value === "boolean") {
        return value;
    }
    const container = value as { value?: unknown };
    if (typeof container.value === "boolean") {
        return container.value;
    }
    return fallback;
}

export function optNumber(value: unknown, fallback: number): number {
    if (value === null || value === undefined) {
        return fallback;
    }
    if (typeof value === "number") {
        return value;
    }
    const container = value as { value?: unknown };
    if (typeof container.value === "number") {
        return container.value;
    }
    return fallback;
}

export function optText(value: unknown, fallback: string): string {
    if (value === null || value === undefined) {
        return fallback;
    }
    if (typeof value === "string") {
        return value === "" ? fallback : value;
    }
    const container = value as { value?: unknown };
    if (typeof container.value === "string") {
        return container.value === "" ? fallback : container.value;
    }
    return fallback;
}

/* --------------------------------------------------------------- geometry */

export function bandLayout(count: number, size: number, paddingRatio: number): { step: number; band: number } {
    if (count <= 0) {
        return { step: 0, band: 0 };
    }
    const step = size / count;
    return { step, band: Math.max(2, step * (1 - clamp(paddingRatio, 0, 0.9))) };
}

/* ------------------------------------------------------------------- data */

export interface Series {
    role: string;
    name: string;
    index: number;
    format: string;
    /** Name of the grouping (series field) this column belongs to, when the host grouped it. */
    groupName: string;
    values: (number | null)[];
    highlights: (number | null)[];
}

export interface GroupedSeries {
    name: string;
    series: Series[];
}

export interface TableGroup {
    role: string;
    name: string;
    index: number;
    labels: string[];
}

export interface Ctx {
    host: Host;
    theme: Theme;
    width: number;
    height: number;
    rows: number;
    /** Category label per row. */
    cats: string[];
    /** Selection id per row, when the host provided identities. */
    identities: (SelId | null)[];
    series: Series[];
    /** Values columns grouped by the series/legend field (categorical mapping only). */
    groups: GroupedSeries[];
    /** Non-measure columns of a table data view (role, display name, labels). */
    tableGroups: TableGroup[];
    table: powerbi.DataViewTable | null;
    categorical: powerbi.DataViewCategorical | null;
    seriesFor(role: string): Series[];
    firstSeries(role: string): Series | null;
    byCategory: { label: string; index: number }[];
    isEmpty: boolean;
}

function measureValues(
    column: powerbi.DataViewValueColumn,
    rows: number
): { values: (number | null)[]; highlights: (number | null)[] } {
    const values: (number | null)[] = [];
    const highlights: (number | null)[] = [];
    for (let index = 0; index < rows; index++) {
        const raw = column.values ? column.values[index] : null;
        values.push(toNumber(raw as PrimitiveValue));
        const highlight = column.highlights ? column.highlights[index] : null;
        highlights.push(highlight === null || highlight === undefined ? null : toNumber(highlight as PrimitiveValue));
    }
    return { values, highlights };
}

export function buildCtx(
    options: powerbi.extensibility.visual.VisualUpdateOptions,
    host: Host,
    theme: Theme
): Ctx {
    const viewport = options.viewport;
    const width = Math.max(20, Math.floor(viewport.width));
    const height = Math.max(20, Math.floor(viewport.height));
    const dataView = options.dataViews && options.dataViews.length ? options.dataViews[0] : null;
    const categorical = dataView && dataView.categorical ? dataView.categorical : null;
    const table = dataView && dataView.table ? dataView.table : null;

    const series: Series[] = [];
    const groups: GroupedSeries[] = [];
    const tableGroups: TableGroup[] = [];
    const cats: string[] = [];
    const identities: (SelId | null)[] = [];
    const byCategory: { label: string; index: number }[] = [];
    let rows = 0;

    if (categorical) {
        let categoryColumn: powerbi.DataViewCategoryColumn | null = null;
        if (categorical.categories && categorical.categories.length) {
            categoryColumn = categorical.categories[0];
        }
        rows = categoryColumn ? categoryColumn.values.length : 0;
        if (!rows && categorical.values && categorical.values.length && categorical.values[0].values) {
            rows = categorical.values[0].values.length;
        }
        const seenCategory = new Set<string>();
        for (let index = 0; index < rows; index++) {
            const label = categoryColumn ? toText(categoryColumn.values[index] as PrimitiveValue) : String(index + 1);
            cats.push(label);
            const dedupeKey = `${label}#${index}`;
            if (!seenCategory.has(label)) {
                seenCategory.add(label);
                byCategory.push({ label, index });
            } else {
                byCategory.push({ label: `${label} (${dedupeKey.length > 0 ? index + 1 : ""})`, index });
            }
            let identity: SelId | null = null;
            const identityValue = categoryColumn && categoryColumn.identity ? categoryColumn.identity[index] : null;
            if (identityValue) {
                try {
                    const builder = host.createSelectionIdBuilder() as unknown as powerbi.visuals.ISelectionIdBuilder;
                    identity = asSelId(builder.withCategory(categoryColumn as powerbi.DataViewCategoryColumn, index).createSelectionId());
                } catch (error) {
                    identity = null;
                }
            }
            identities.push(identity);
        }
        const valueColumns = categorical.values || [];
        const groupNamesSeen: string[] = [];
        for (let index = 0; index < valueColumns.length; index++) {
            const column = valueColumns[index];
            const role = firstRole(column.source.roles);
            const group = (column as powerbi.DataViewValueColumn & { groupName?: string }).groupName;
            const parsed = measureValues(column, rows);
            const groupName = toText((column.source.groupName as PrimitiveValue) ?? null);
            series.push({
                role,
                name: group ? `${column.source.displayName} · ${group}` : groupName ? `${column.source.displayName} · ${groupName}` : column.source.displayName,
                index,
                format: column.source.format || "",
                groupName,
                values: parsed.values,
                highlights: parsed.highlights
            });
        }
        for (const item of series) {
            if (item.groupName && groupNamesSeen.indexOf(item.groupName) < 0) {
                groupNamesSeen.push(item.groupName);
            }
        }
        for (const name of groupNamesSeen) {
            groups.push({ name, series: series.filter((item) => item.groupName === name) });
        }
    } else if (table && table.rows && table.columns) {
        rows = table.rows.length;
        const categoryColumn = table.columns.find((column) => firstRole(column.roles) === "category") || table.columns[0];
        for (let index = 0; index < rows; index++) {
            const row = table.rows[index];
            const categoryIndex = typeof categoryColumn.index === "number" ? categoryColumn.index : table.columns.indexOf(categoryColumn);
            cats.push(toText(row[categoryIndex] as PrimitiveValue));
            byCategory.push({ label: toText(row[categoryIndex] as PrimitiveValue), index });
            let identity: SelId | null = null;
            const identityValue = table.identity ? table.identity[index] : null;
            if (identityValue) {
                try {
                    const builder = host.createSelectionIdBuilder() as unknown as powerbi.visuals.ISelectionIdBuilder;
                    identity = asSelId(builder.withTable(table, index).createSelectionId());
                } catch (error) {
                    identity = null;
                }
            }
            identities.push(identity);
        }
        for (let index = 0; index < table.columns.length; index++) {
            const column = table.columns[index];
            const role = firstRole(column.roles);
            if (column === categoryColumn) {
                continue;
            }
            const values: (number | null)[] = [];
            const labels: string[] = [];
            for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
                const raw = table.rows[rowIndex][index] as PrimitiveValue;
                values.push(toNumber(raw));
                labels.push(toText(raw));
            }
            const numeric = values.filter((value) => value !== null).length;
            if (!numeric && labels.some((label) => !!label)) {
                tableGroups.push({ role, name: column.displayName, index, labels });
            }
            series.push({
                role,
                name: column.displayName,
                index,
                format: column.format || "",
                groupName: "",
                values,
                highlights: values.map(() => null)
            });
        }
    }

    const ctx: Ctx = {
        host,
        theme,
        width,
        height,
        rows,
        cats,
        identities,
        series,
        groups,
        tableGroups,
        table,
        categorical,
        byCategory,
        isEmpty: rows === 0 || series.length === 0 || series.every((item) => item.values.every((value) => value === null)),
        seriesFor(role: string): Series[] {
            return series.filter((item) => item.role === role);
        },
        firstSeries(role: string): Series | null {
            const matches = series.filter((item) => item.role === role);
            return matches.length ? matches[0] : null;
        }
    };
    return ctx;
}

function firstRole(roles: { [name: string]: boolean } | undefined): string {
    if (!roles) {
        return "";
    }
    const keys = Object.keys(roles);
    return keys.length ? keys[0] : "";
}

/** Numeric series that are not tied to a declared role: useful fallbacks. */
export function numericSeries(ctx: Ctx): Series[] {
    return ctx.series.filter((item) => item.values.some((value) => value !== null));
}

export function seriesValues(series: Series | null): number[] {
    if (!series) {
        return [];
    }
    return series.values.filter((value): value is number => value !== null && isFinite(value));
}

export function sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

export function extent(values: number[]): [number, number] {
    if (!values.length) {
        return [0, 1];
    }
    let min = values[0];
    let max = values[0];
    for (const value of values) {
        if (value < min) {
            min = value;
        }
        if (value > max) {
            max = value;
        }
    }
    if (min === max) {
        max = min + (Math.abs(min) || 1);
    }
    return [min, max];
}

/** SVG arc path for donut/ring segments (angles in radians, 0 = 12 o'clock). */
export function arcPath(cx: number, cy: number, inner: number, outer: number, startAngle: number, endAngle: number): string {
    const start = startAngle - Math.PI / 2;
    const end = endAngle - Math.PI / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + outer * Math.cos(start);
    const y1 = cy + outer * Math.sin(start);
    const x2 = cx + outer * Math.cos(end);
    const y2 = cy + outer * Math.sin(end);
    const x3 = cx + inner * Math.cos(end);
    const y3 = cy + inner * Math.sin(end);
    const x4 = cx + inner * Math.cos(start);
    const y4 = cy + inner * Math.sin(start);
    return [
        `M${x1.toFixed(2)},${y1.toFixed(2)}`,
        `A${outer},${outer} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`,
        `L${x3.toFixed(2)},${y3.toFixed(2)}`,
        `A${inner},${inner} 0 ${large} 0 ${x4.toFixed(2)},${y4.toFixed(2)}`,
        "Z"
    ].join("");
}

/* ---------------------------------------------------------- interactions */

export class Interactions {
    public selectionManager: powerbi.extensibility.ISelectionManager;
    private selected: { [key: string]: boolean } = {};
    private listeners: (() => void)[] = [];

    constructor(host: Host) {
        this.selectionManager = host.createSelectionManager();
        if (this.selectionManager.registerOnSelectCallback) {
            this.selectionManager.registerOnSelectCallback((ids: unknown[]) => {
                this.selected = {};
                for (const raw of ids || []) {
                    const id = asSelId(raw);
                    if (id) {
                        this.selected[id.getKey()] = true;
                    }
                }
                for (const listener of this.listeners) {
                    listener();
                }
            });
        }
    }

    public onChange(listener: () => void): void {
        this.listeners.push(listener);
    }

    public isSelected(identity: SelId | null): boolean {
        if (!identity) {
            return false;
        }
        return !!this.selected[identity.getKey()];
    }

    public hasSelection(): boolean {
        for (const key of Object.keys(this.selected)) {
            if (this.selected[key]) {
                return true;
            }
        }
        return false;
    }

    public select(identity: SelId | null, multiSelect: boolean): void {
        if (!identity) {
            return;
        }
        this.selectionManager.select(identity as unknown as powerbi.extensibility.ISelectionId, multiSelect);
    }

    public clear(): void {
        this.selectionManager.clear();
    }

    public contextMenu(
        identity: SelId | null,
        event: MouseEvent | KeyboardEvent
    ): void {
        if (!identity) {
            return;
        }
        const position = positionOf(event);
        this.selectionManager.showContextMenu(identity as unknown as powerbi.extensibility.ISelectionId, position);
        event.preventDefault();
    }

    public tooltip(
        host: Host,
        event: MouseEvent | KeyboardEvent,
        items: powerbi.extensibility.VisualTooltipDataItem[],
        identities: (SelId | null)[]
    ): void {
        if (!items.length || !host.tooltipService || !host.tooltipService.enabled()) {
            return;
        }
        host.tooltipService.show({
            coordinates: positionArray(event),
            isTouchEvent: isTouch(event),
            dataItems: items,
            identities: identities.filter((id): id is SelId => !!id) as unknown as powerbi.extensibility.ISelectionId[]
        });
    }

    public moveTooltip(host: Host, event: MouseEvent | KeyboardEvent): void {
        if (!host.tooltipService || !host.tooltipService.enabled()) {
            return;
        }
        host.tooltipService.move({
            coordinates: positionArray(event),
            isTouchEvent: isTouch(event),
            identities: []
        });
    }

    public hideTooltip(host: Host, event: MouseEvent | KeyboardEvent): void {
        if (!host.tooltipService || !host.tooltipService.enabled()) {
            return;
        }
        host.tooltipService.hide({ isTouchEvent: isTouch(event), immediately: false });
    }
}

export function positionOf(event: MouseEvent | KeyboardEvent): { x: number; y: number } {
    const mouse = event as MouseEvent;
    const clientX = typeof mouse.clientX === "number" ? mouse.clientX : 0;
    const clientY = typeof mouse.clientY === "number" ? mouse.clientY : 0;
    const target = event.target as HTMLElement | null;
    let left = 0;
    let top = 0;
    if (target && typeof target.getBoundingClientRect === "function") {
        const rect = target.getBoundingClientRect();
        left = rect.left;
        top = rect.top;
    }
    return { x: clientX - left, y: clientY - top };
}

export function positionArray(event: MouseEvent | KeyboardEvent): number[] {
    const mouse = event as MouseEvent;
    return [typeof mouse.clientX === "number" ? mouse.clientX : 0, typeof mouse.clientY === "number" ? mouse.clientY : 0];
}

function isTouch(event: MouseEvent | KeyboardEvent): boolean {
    const pointer = event as PointerEvent;
    return event.type.indexOf("touch") === 0 || (event.type.indexOf("pointer") === 0 && pointer.pointerType === "touch");
}

/* ----------------------------------------------------------------- chrome */

export interface Chrome {
    root: HTMLElement;
    header: HTMLElement;
    body: HTMLElement;
    footer: HTMLElement;
    theme: Theme;
    titleEl: HTMLElement;
    subEl: HTMLElement;
}

export function renderChrome(
    target: HTMLElement,
    theme: Theme,
    options: { title?: string; subtitle?: string; compactHeader?: boolean }
): Chrome {
    clear(target);
    target.style.backgroundColor = theme.bg;
    target.style.fontFamily = theme.mono
        ? '"JetBrains Mono","Fira Code",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
        : '"Segoe UI Variable Text","Segoe UI",Inter,system-ui,-apple-system,sans-serif';
    target.style.overflow = "hidden";
    target.style.position = "relative";

    const root = el("div", { class: "tl-root" });
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.width = "100%";
    root.style.height = "100%";
    root.style.boxSizing = "border-box";

    const header = el("div", { class: "tl-header" });
    header.style.display = "flex";
    header.style.alignItems = "baseline";
    header.style.gap = "8px";
    header.style.padding = options.compactHeader ? "6px 10px 2px" : "10px 12px 4px";
    header.style.flex = "0 0 auto";

    const titleEl = el("span", { class: "tl-title" }, options.title || "");
    titleEl.style.fontSize = "13px";
    titleEl.style.fontWeight = "700";
    titleEl.style.letterSpacing = "0.02em";
    titleEl.style.color = theme.fg;
    titleEl.style.textTransform = "uppercase";

    const subEl = el("span", { class: "tl-sub" }, options.subtitle || "");
    subEl.style.fontSize = "11px";
    subEl.style.color = theme.sub;

    append(header, titleEl, subEl);

    const body = el("div", { class: "tl-body" });
    body.style.flex = "1 1 auto";
    body.style.minHeight = "0";
    body.style.position = "relative";
    body.style.padding = "0 12px 8px";
    body.style.boxSizing = "border-box";

    const footer = el("div", { class: "tl-footer" });
    footer.style.flex = "0 0 auto";
    footer.style.padding = "0 12px 8px";
    footer.style.display = "flex";
    footer.style.alignItems = "center";
    footer.style.gap = "10px";
    footer.style.flexWrap = "wrap";

    append(root, header, body, footer);
    target.appendChild(root);
    return { root, header, body, footer, theme, titleEl, subEl };
}

/** Usable drawing area of a chrome body, resilient to a 0x0 layout in headless checks. */
export function bodySize(chrome: Chrome, ctx: Ctx): { width: number; height: number } {
    const rect = chrome.body.getBoundingClientRect ? chrome.body.getBoundingClientRect() : null;
    const width = rect && rect.width > 40 ? rect.width : Math.max(60, ctx.width - 24);
    const height = rect && rect.height > 40 ? rect.height : Math.max(60, ctx.height - 56);
    return { width: Math.floor(width), height: Math.floor(height) };
}

export function renderEmpty(chrome: Chrome, message: string, hint?: string): void {
    clear(chrome.body);
    chrome.body.style.display = "flex";
    chrome.body.style.flexDirection = "column";
    chrome.body.style.alignItems = "center";
    chrome.body.style.justifyContent = "center";
    chrome.body.style.gap = "4px";
    chrome.body.style.height = "100%";
    const title = el("div", { class: "tl-empty-title" }, message);
    title.style.color = chrome.theme.fg;
    title.style.fontSize = "12px";
    title.style.fontWeight = "600";
    title.style.textAlign = "center";
    append(chrome.body, title);
    if (hint) {
        const note = el("div", { class: "tl-empty-hint" }, hint);
        note.style.color = chrome.theme.sub;
        note.style.fontSize = "11px";
        note.style.textAlign = "center";
        append(chrome.body, note);
    }
}

export interface LegendItem {
    label: string;
    color: string;
    shape?: "square" | "line" | "dot";
    muted?: boolean;
}

export function renderLegend(target: HTMLElement, chrome: Chrome, items: LegendItem[], onClick?: (item: LegendItem) => void): void {
    clear(target);
    target.style.display = "flex";
    target.style.alignItems = "center";
    target.style.gap = "12px";
    target.style.flexWrap = "wrap";
    target.style.fontSize = "10px";
    for (const item of items) {
        const wrapper = el("span", { class: "tl-legend-item" });
        wrapper.style.display = "inline-flex";
        wrapper.style.alignItems = "center";
        wrapper.style.gap = "5px";
        wrapper.style.color = item.muted ? chrome.theme.sub : chrome.theme.fg;
        wrapper.style.opacity = item.muted ? "0.55" : "1";
        wrapper.style.cursor = onClick ? "pointer" : "default";

        const shape = el("span", { class: "tl-legend-swatch" });
        shape.style.display = "inline-block";
        shape.style.width = item.shape === "line" ? "14px" : "9px";
        shape.style.height = item.shape === "line" ? "3px" : "9px";
        shape.style.borderRadius = item.shape === "dot" ? "50%" : "2px";
        shape.style.backgroundColor = item.color;
        append(wrapper, shape, el("span", { class: "tl-legend-label" }, item.label));
        if (onClick) {
            wrapper.addEventListener("click", () => onClick(item));
        }
        target.appendChild(wrapper);
    }
}

/** Compact inline sparkline used by the table-style visuals. */
export function sparkline(
    values: (number | null)[],
    width: number,
    height: number,
    color: string,
    options?: { endDot?: boolean; muted?: boolean }
): SVGSVGElement {
    const svg = svgEl("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "tl-spark" });
    svg.style.display = "block";
    svg.style.overflow = "visible";
    const numeric = values.filter((value): value is number => value !== null && isFinite(value));
    if (numeric.length < 2) {
        append(
            svg,
            svgEl("line", {
                x1: 0,
                y1: height / 2,
                x2: width,
                y2: height / 2,
                stroke: rgba(color, 0.25),
                "stroke-width": 1
            })
        );
        return svg;
    }
    const min = Math.min(...numeric);
    const max = Math.max(...numeric);
    const scaleY = linearScale(min, max, height - 2, 2);
    const scaleX = linearScale(0, numeric.length - 1, 1, width - 1);
    let path = "";
    let pointIndex = 0;
    values.forEach((value) => {
        if (value === null || !isFinite(value)) {
            return;
        }
        const x = scaleX(pointIndex);
        const y = scaleY(value);
        path += `${pointIndex === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
        pointIndex++;
    });
    append(
        svg,
        svgEl("path", {
            d: path,
            fill: "none",
            stroke: options && options.muted ? rgba(color, 0.4) : color,
            "stroke-width": 1.6,
            "stroke-linecap": "round",
            "stroke-linejoin": "round"
        })
    );
    if (options && options.endDot) {
        const last = numeric[numeric.length - 1];
        append(
            svg,
            svgEl("circle", {
                cx: scaleX(numeric.length - 1),
                cy: scaleY(last),
                r: 2.4,
                fill: color
            })
        );
    }
    return svg;
}

export function pill(text: string, foreground: string, background: string): HTMLElement {
    const node = styled(
        "span",
        {
            "font-size": "9px",
            "line-height": "1.4",
            padding: "1px 6px",
            "border-radius": "999px",
            "font-weight": "700",
            "letter-spacing": "0.04em"
        },
        { class: "tl-pill" },
        text
    );
    node.style.color = foreground;
    node.style.backgroundColor = background;
    return node;
}
