/**
 * Matriz de calor — heatmap com duas dimensões (linha x coluna), escala de cor
 * sequencial, totais por linha e por coluna e destaque do maior valor.
 * Consome o mapeamento "table" (Categoria, Coluna, Valor), o mesmo formato que a
 * matriz nativa usa para cruzar duas dimensões com uma medida.
 */

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import {
    bodySize,
    buildCtx,
    clamp,
    formatCompact,
    formatNumber,
    mixColors,
    optBool,
    optNumber,
    renderChrome,
    renderEmpty,
    rgba,
    sum
} from "../../../shared/src/kit";
import { TalosVisual } from "../../../shared/src/base";
import { BaseSettings, PresentationCard, decimalsOf, resolvedTheme, showValuesOf } from "../../../shared/src/settings";
import { append, el, svgEl, svgRoot } from "../../../shared/src/dom";

class HeatCard extends PresentationCard {
    name: string = "matrixHeat";
    displayName: string = "Matriz de calor";

    showRowTotals = new formattingSettings.ToggleSwitch({
        name: "showRowTotals",
        displayName: "Totais por linha",
        value: true
    });

    cellGap = new formattingSettings.NumUpDown({
        name: "cellGap",
        displayName: "Espaço entre células",
        value: 2
    });

    colorMode = new formattingSettings.ItemDropdown({
        name: "colorMode",
        displayName: "Escala de cor",
        items: [
            { value: "single", displayName: "Uma cor (intensidade)" },
            { value: "two", displayName: "Duas cores (destaque)" },
            { value: "diverging", displayName: "Divergente (zero no centro)" }
        ],
        value: { value: "two", displayName: "Duas cores (destaque)" }
    });

    slices = [
        this.theme,
        this.accent,
        this.accent2,
        this.decimals,
        this.showValues,
        this.showLegend,
        this.showRowTotals,
        this.cellGap,
        this.colorMode
    ];
}

class HeatSettings extends BaseSettings {
    matrixHeat = new HeatCard();
    cards = [this.presentation, this.matrixHeat];
}

export class Visual extends TalosVisual {
    protected settingsModel(): { new (): formattingSettings.Model } {
        return HeatSettings;
    }

    protected render(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        const settings = this.settings as HeatSettings;
        const theme = resolvedTheme(settings);
        const ctx = buildCtx(options, this.host, theme);
        const decimals = decimalsOf(settings);
        const showValues = showValuesOf(settings);

        const measure = ctx.firstSeries("measure") || ctx.series.filter((item) => item.values.some((value) => value !== null))[0] || null;
        const chrome = renderChrome(this.root, theme, {
            title: "Matriz de calor",
            subtitle: measure ? measure.name : ""
        });

        if (ctx.isEmpty || !measure) {
            renderEmpty(chrome, "Adicione Categoria, Coluna e Valor", "Linha x coluna cruzadas por uma medida");
            return;
        }

        // Column dimension: grouped values (Category + Column + Measure) or the second
        // non-measure column when the host hands the data over as a table.
        const tableGroup = ctx.tableGroups.length ? ctx.tableGroups[0] : null;
        let columnLabels: string[] = [];
        let valueAt: (rowIndex: number, columnIndex: number) => number | null;

        if (ctx.groups.length > 1) {
            columnLabels = ctx.groups.map((group) => group.name);
            valueAt = (_rowIndex: number, columnIndex: number): number | null => {
                const group = ctx.groups[columnIndex];
                if (!group || !group.series.length) {
                    return null;
                }
                const match = group.series.find((item) => item.role === "measure") || group.series[0];
                return match.values[_rowIndex];
            };
        } else if (tableGroup) {
            const seen: string[] = [];
            for (const label of tableGroup.labels) {
                if (seen.indexOf(label) < 0) {
                    seen.push(label);
                }
            }
            columnLabels = seen;
            valueAt = (rowIndex: number, columnIndex: number): number | null => {
                const wanted = columnLabels[columnIndex];
                if (wanted === undefined) {
                    return null;
                }
                for (let index = 0; index < tableGroup.labels.length; index++) {
                    if (tableGroup.labels[index] === wanted && ctx.cats[index] === ctx.cats[rowIndex]) {
                        return measure.values[index];
                    }
                }
                return null;
            };
        } else {
            columnLabels = [measure.name];
            valueAt = (rowIndex: number): number | null => measure.values[rowIndex];
        }

        const rowOrder = ctx.byCategory.map((entry) => entry.index);
        const values: number[] = [];
        for (const rowIndex of rowOrder) {
            for (let columnIndex = 0; columnIndex < columnLabels.length; columnIndex++) {
                const value = valueAt(rowIndex, columnIndex);
                if (value !== null && isFinite(value)) {
                    values.push(value);
                }
            }
        }
        if (!values.length) {
            renderEmpty(chrome, "Sem valores cruzados", "Confira se linha e coluna formam pares com valor");
            return;
        }
        const min = Math.min(...values);
        const max = Math.max(...values);
        const showRowTotals = optBool(settings.matrixHeat.showRowTotals.value, true);
        const gap = clamp(optNumber(settings.matrixHeat.cellGap.value, 2), 0, 12);
        const colorMode = String((settings.matrixHeat.colorMode.value as { value?: string }).value || "two");

        const size = bodySize(chrome, ctx);
        const totalColumnWidth = showRowTotals ? clamp(size.width * 0.16, 54, 108) : 4;
        const rowLabelWidth = clamp(size.width * 0.22, 74, 190);
        const headerHeight = 24;
        const plotWidth = Math.max(40, size.width - rowLabelWidth - totalColumnWidth);
        const plotHeight = Math.max(30, size.height - headerHeight - 16);
        const cellWidth = plotWidth / Math.max(1, columnLabels.length);
        const rowCount = Math.max(1, Math.min(rowOrder.length, Math.floor(plotHeight / 14)));
        const cellHeight = plotHeight / rowCount;

        const svg = svgRoot(size.width, size.height);
        const selected = this.interactions.hasSelection();

        const colorFor = (value: number | null): string => {
            if (value === null || !isFinite(value)) {
                return rgba(theme.grid, 0.5);
            }
            if (colorMode === "single") {
                const t = max === min ? 0.5 : (value - min) / (max - min);
                return mixColors(rgba(theme.accent, 0.12), theme.accent, 0.15 + t * 0.85);
            }
            if (colorMode === "diverging") {
                const bound = Math.max(Math.abs(min), Math.abs(max)) || 1;
                const t = clamp(value / bound, -1, 1);
                return t >= 0 ? mixColors(theme.grid, theme.accent2, Math.abs(t)) : mixColors(theme.grid, "#EF6F87", Math.abs(t));
            }
            const t = max === min ? 0.5 : (value - min) / (max - min);
            return mixColors(mixColors(theme.accent, theme.card, 0.55), theme.accent2, t);
        };

        // column headers
        const header = svgEl("g", { class: "tl-heat-header" });
        const rotate = cellWidth < 56;
        columnLabels.forEach((label, columnIndex) => {
            const x = rowLabelWidth + columnIndex * cellWidth + cellWidth / 2;
            const text = svgEl(
                "text",
                {
                    x: rotate ? rowLabelWidth + columnIndex * cellWidth + 6 : x,
                    y: rotate ? 18 : 16,
                    fill: theme.sub,
                    "font-size": 10,
                    "text-anchor": rotate ? "end" : "middle"
                },
                label.length > 14 ? `${label.slice(0, 13)}…` : label
            );
            if (rotate) {
                text.setAttribute("transform", `rotate(-35, ${rowLabelWidth + columnIndex * cellWidth + 6}, 18)`);
            }
            append(header, text);
        });
        append(svg, header);

        const body = svgEl("g", { class: "tl-heat-body" });
        let bestRow = -1;
        let bestColumn = -1;
        let bestValue = -Infinity;

        rowOrder.slice(0, rowCount).forEach((rowIndex, position) => {
            const y = headerHeight + position * cellHeight;
            const identity = ctx.identities[rowIndex];
            const isSelected = this.interactions.isSelected(identity);
            const rowOpacity = selected && !isSelected ? 0.35 : 1;

            append(
                body,
                svgEl(
                    "text",
                    {
                        x: rowLabelWidth - 8,
                        y: y + cellHeight / 2 + 3,
                        fill: theme.fg,
                        "font-size": 10,
                        "text-anchor": "end",
                        opacity: rowOpacity
                    },
                    ctx.cats[rowIndex].length > 22 ? `${ctx.cats[rowIndex].slice(0, 21)}…` : ctx.cats[rowIndex]
                )
            );

            let rowTotal: number | null = null;
            for (let columnIndex = 0; columnIndex < columnLabels.length; columnIndex++) {
                const value = valueAt(rowIndex, columnIndex);
                if (value !== null && value > bestValue) {
                    bestValue = value;
                    bestRow = position;
                    bestColumn = columnIndex;
                }
                if (value !== null) {
                    rowTotal = (rowTotal || 0) + value;
                }
                const cell = svgEl("rect", {
                    x: rowLabelWidth + columnIndex * cellWidth + gap / 2,
                    y: y + gap / 2,
                    width: Math.max(1, cellWidth - gap),
                    height: Math.max(1, cellHeight - gap),
                    rx: Math.min(3, theme.radius),
                    fill: colorFor(value),
                    opacity: rowOpacity
                });
                cell.style.cursor = identity ? "pointer" : "default";
                const items = [
                    { displayName: "Linha", value: ctx.cats[rowIndex] },
                    { displayName: "Coluna", value: columnLabels[columnIndex] },
                    { displayName: measure.name, value: formatNumber(value, { format: measure.format, decimals }) }
                ];
                cell.addEventListener("pointermove", (event: PointerEvent) => {
                    this.interactions.moveTooltip(this.host, event);
                    this.interactions.tooltip(this.host, event, items, identity ? [identity] : []);
                });
                cell.addEventListener("pointerleave", (event: PointerEvent) => this.interactions.hideTooltip(this.host, event));
                cell.addEventListener("click", (event: MouseEvent) => this.interactions.select(identity, event.ctrlKey || event.metaKey));
                cell.addEventListener("contextmenu", (event: MouseEvent) => this.interactions.contextMenu(identity, event));
                append(body, cell);

                if (showValues && cellWidth > 42 && cellHeight > 16) {
                    append(
                        body,
                        svgEl(
                            "text",
                            {
                                x: rowLabelWidth + columnIndex * cellWidth + cellWidth / 2,
                                y: y + cellHeight / 2 + 3,
                                fill: "#FFFFFF",
                                "font-size": Math.min(10, cellHeight * 0.45),
                                "text-anchor": "middle",
                                opacity: rowOpacity * 0.92,
                                "pointer-events": "none"
                            },
                            formatCompact(value, cellHeight > 22 ? 1 : 0)
                        )
                    );
                }
            }

            if (showRowTotals) {
                append(
                    body,
                    svgEl(
                        "text",
                        {
                            x: size.width - 6,
                            y: y + cellHeight / 2 + 3,
                            fill: theme.fg,
                            "font-size": 10,
                            "font-weight": 600,
                            "text-anchor": "end",
                            opacity: rowOpacity
                        },
                        formatCompact(rowTotal, 1)
                    )
                );
            }
        });
        append(svg, body);

        if (bestRow >= 0) {
            append(
                svg,
                svgEl("rect", {
                    x: rowLabelWidth + bestColumn * cellWidth + gap / 2,
                    y: headerHeight + bestRow * cellHeight + gap / 2,
                    width: Math.max(1, cellWidth - gap),
                    height: Math.max(1, cellHeight - gap),
                    rx: Math.min(3, theme.radius),
                    fill: "none",
                    stroke: theme.fg,
                    "stroke-width": 2,
                    "stroke-dasharray": "4 3",
                    "pointer-events": "none"
                })
            );
        }

        append(chrome.body, svg);

        const notes = el("span", { class: "tl-note" });
        notes.style.fontSize = "10px";
        notes.style.color = theme.sub;
        notes.textContent = `máx ${formatNumber(max, { decimals: 1 })} · mín ${formatNumber(min, { decimals: 1 })} · soma ${formatCompact(sum(values), 1)}`;
        append(chrome.footer, notes);
    }
}
