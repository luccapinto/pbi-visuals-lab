/**
 * Dumbbell comparativo — compara dois valores por categoria num eixo comum,
 * com delta calculado, ordenação, destaque de cross-filter e seleção cruzada.
 */

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import {
    Ctx,
    Series,
    SelId,
    Theme,
    axisFormatter,
    buildCtx,
    clamp,
    colorForKey,
    formatNumber,
    linearScale,
    niceTicks,
    optBool,
    optNumber,
    optColor,
    rgba,
    seriesValues,
    bodySize,
    renderChrome,
    renderEmpty,
    renderLegend,
    sparkline,
    extent,
    sum
} from "../../../shared/src/kit";
import { TalosVisual } from "../../../shared/src/base";
import { BaseSettings, PresentationCard, decimalsOf, resolvedTheme, showLegendOf, showValuesOf } from "../../../shared/src/settings";
import { append, svgEl, svgRoot, el } from "../../../shared/src/dom";

class DumbbellCard extends PresentationCard {
    name: string = "dumbbell";
    displayName: string = "Dumbbell";

    labelWidth = new formattingSettings.NumUpDown({
        name: "labelWidth",
        displayName: "Largura dos rótulos (px)",
        value: 120
    });

    dotSize = new formattingSettings.NumUpDown({
        name: "dotSize",
        displayName: "Tamanho dos pontos",
        value: 6
    });

    sortBy = new formattingSettings.ItemDropdown({
        name: "sortBy",
        displayName: "Ordenar por",
        items: [
            { value: "end", displayName: "Valor final" },
            { value: "start", displayName: "Valor inicial" },
            { value: "delta", displayName: "Delta" },
            { value: "category", displayName: "Categoria" }
        ],
        value: { value: "end", displayName: "Valor final" }
    });

    showDelta = new formattingSettings.ToggleSwitch({
        name: "showDelta",
        displayName: "Coluna de delta",
        value: true
    });

    sortDirection = new formattingSettings.ItemDropdown({
        name: "sortDirection",
        displayName: "Direção",
        items: [
            { value: "desc", displayName: "Decrescente" },
            { value: "asc", displayName: "Crescente" }
        ],
        value: { value: "desc", displayName: "Decrescente" }
    });

    slices = [
        this.theme,
        this.accent,
        this.accent2,
        this.decimals,
        this.showValues,
        this.showLegend,
        this.labelWidth,
        this.dotSize,
        this.sortBy,
        this.sortDirection,
        this.showDelta
    ];
}

class DumbbellSettings extends BaseSettings {
    dumbbell = new DumbbellCard();
    cards = [this.presentation, this.dumbbell];
}

interface Row {
    index: number;
    label: string;
    start: number | null;
    end: number | null;
    identity: SelId | null;
    highlighted: number | null;
}

export class Visual extends TalosVisual {
    protected settingsModel(): { new (): formattingSettings.Model } {
        return DumbbellSettings;
    }

    protected render(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        const settings = this.settings as DumbbellSettings;
        const theme = resolvedTheme(settings);
        const ctx = buildCtx(options, this.host, theme);
        const decimals = decimalsOf(settings);
        const showValues = showValuesOf(settings);

        const startSeries = ctx.firstSeries("start") || ctx.series[0] || null;
        const endSeries = ctx.firstSeries("end") || ctx.series[1] || null;

        const chrome = renderChrome(this.root, theme, {
            title: "Dumbbell comparativo",
            subtitle: startSeries && endSeries ? `${startSeries.name} vs ${endSeries.name}` : ""
        });

        if (ctx.isEmpty || !startSeries || !endSeries) {
            renderEmpty(chrome, "Adicione Categoria, Valor inicial e Valor final", "Aceita tabela ou colunas categóricas");
            return;
        }

        const rows: Row[] = ctx.byCategory.map((entry) => ({
            index: entry.index,
            label: entry.label,
            start: startSeries.values[entry.index],
            end: endSeries.values[entry.index],
            identity: ctx.identities[entry.index],
            highlighted: endSeries.highlights[entry.index]
        }));

        const labelWidth = Math.round(optNumber(settings.dumbbell.labelWidth.value, 120));
        const dotSize = clamp(optNumber(settings.dumbbell.dotSize.value, 6), 2, 20);
        const showDelta = optBool(settings.dumbbell.showDelta.value, true);
        const sortByKey = String((settings.dumbbell.sortBy.value as { value?: string }).value || "end");
        const asc = String((settings.dumbbell.sortDirection.value as { value?: string }).value || "desc") === "asc";

        const valueFor = (row: Row): number => {
            if (sortByKey === "start") {
                return row.start === null ? -Infinity : row.start;
            }
            if (sortByKey === "delta") {
                if (row.start === null || row.end === null) {
                    return -Infinity;
                }
                return row.end - row.start;
            }
            if (sortByKey === "category") {
                return 0;
            }
            return row.end === null ? -Infinity : row.end;
        };
        const sorted = rows.slice();
        if (sortByKey === "category") {
            sorted.sort((a, b) => (asc ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label)));
        } else {
            sorted.sort((a, b) => (asc ? valueFor(a) - valueFor(b) : valueFor(b) - valueFor(a)));
        }

        const size = bodySize(chrome, ctx);
        const deltaWidth = showDelta ? clamp(size.width * 0.2, 54, 92) : 0;
        const sparkWidth = size.width > 520 ? 54 : 0;
        // Faixas laterais reservadas para os valores das pontas: assim o rótulo
        // fica na mesma linha do ponto e não colide com a linha de cima.
        const valueWidth = showValues && size.width > 420 ? 58 : 0;
        const plot = {
            x: labelWidth + 8 + valueWidth,
            width: Math.max(60, size.width - labelWidth - deltaWidth - sparkWidth - 26 - valueWidth * 2),
            y: 22,
            height: Math.max(40, size.height - 40)
        };

        const allValues: number[] = [];
        for (const row of sorted) {
            if (row.start !== null) {
                allValues.push(row.start);
            }
            if (row.end !== null) {
                allValues.push(row.end);
            }
        }
        const [dataMin, dataMax] = extent(allValues);
        const span = dataMax - dataMin;
        const domainMin = dataMin < 0 ? dataMin - span * 0.12 : Math.max(0, dataMin - span * 0.15);
        const domainMax = dataMax > 0 ? dataMax + span * 0.12 : dataMax;
        const scale = linearScale(domainMin, domainMax, plot.x, plot.x + plot.width);
        const rowsPerView = sorted.length;
        const step = plot.height / Math.max(1, rowsPerView);
        const tickFormatter = axisFormatter(domainMax - domainMin, decimals);

        const svg = svgRoot(size.width, size.height);
        svg.setAttribute("class", "tl-svg tl-dumbbell");
        const selected = this.interactions.hasSelection();

        // grid + axis
        const axis = svgEl("g", { class: "tl-axis" });
        for (const tick of niceTicks(domainMin, domainMax, 5)) {
            const x = scale(tick);
            append(
                axis,
                svgEl("line", {
                    x1: x,
                    y1: plot.y - 14,
                    x2: x,
                    y2: plot.y + plot.height,
                    stroke: theme.grid,
                    "stroke-width": 1,
                    "stroke-dasharray": tick === 0 ? "" : "3 4"
                })
            );
            append(
                axis,
                svgEl(
                    "text",
                    {
                        x,
                        y: plot.y - 18,
                        fill: theme.sub,
                        "font-size": 9,
                        "text-anchor": "middle"
                    },
                    tickFormatter(tick)
                )
            );
        }
        append(svg, axis);

        const rowGroup = svgEl("g", { class: "tl-rows" });
        sorted.forEach((row, position) => {
            const centerY = plot.y + step * (position + 0.5);
            const isSelected = this.interactions.isSelected(row.identity);
            const opacity = selected && !isSelected ? 0.32 : 1;
            const group = svgEl("g", { class: "tl-row", opacity });
            group.style.cursor = row.identity ? "pointer" : "default";

            const startX = row.start === null ? null : clamp(scale(row.start), plot.x, plot.x + plot.width);
            const endX = row.end === null ? null : clamp(scale(row.end), plot.x, plot.x + plot.width);
            const rowColor = colorForKey(row.label, theme.palette);
            const endColor = colorForKey(row.label, theme.palette);

            // label
            append(
                group,
                svgEl(
                    "text",
                    {
                        x: labelWidth,
                        y: centerY + 4,
                        fill: theme.fg,
                        "font-size": 11,
                        "text-anchor": "end"
                    },
                    row.label.length > 26 ? `${row.label.slice(0, 25)}…` : row.label
                )
            );

            if (startX !== null && endX !== null) {
                const goingUp = endX >= startX;
                const gradientId = `dmb-${this.host.instanceId || "v"}-${position}`;
                const defs = svgEl("defs");
                const gradient = svgEl("linearGradient", {
                    id: gradientId,
                    x1: startX,
                    y1: 0,
                    x2: endX,
                    y2: 0,
                    gradientUnits: "userSpaceOnUse"
                });
                append(gradient, svgEl("stop", { offset: "0%", "stop-color": rowColor }));
                append(gradient, svgEl("stop", { offset: "100%", "stop-color": theme.accent2 }));
                append(defs, gradient);
                append(group, defs);

                append(
                    group,
                    svgEl("line", {
                        x1: startX,
                        y1: centerY,
                        x2: endX,
                        y2: centerY,
                        stroke: `url(#${gradientId})`,
                        "stroke-width": goingUp ? 4 : 3,
                        "stroke-linecap": "round",
                        opacity: 0.85
                    })
                );
                append(
                    group,
                    svgEl("circle", { cx: startX, cy: centerY, r: dotSize - 1.4, fill: theme.bg, stroke: rowColor, "stroke-width": 2.2 })
                );
                append(group, svgEl("circle", { cx: endX, cy: centerY, r: dotSize, fill: endColor, stroke: theme.bg, "stroke-width": 1.6 }));
            } else {
                const point = startX === null ? endX : startX;
                const value = startX === null ? row.start : row.end;
                if (point !== null && value !== null) {
                    append(group, svgEl("circle", { cx: point, cy: centerY, r: dotSize - 1, fill: colorForKey(row.label, theme.palette) }));
                }
            }

            // Valores nas faixas laterais, alinhados com o próprio ponto.
            if (valueWidth) {
                if (startX !== null) {
                    append(
                        group,
                        svgEl(
                            "text",
                            {
                                x: plot.x - 10,
                                y: centerY + 3,
                                fill: theme.sub,
                                "font-size": Math.min(10, step * 0.38),
                                "text-anchor": "end"
                            },
                            formatNumber(row.start, { format: startSeries.format, decimals })
                        )
                    );
                }
                if (endX !== null) {
                    append(
                        group,
                        svgEl(
                            "text",
                            {
                                x: plot.x + plot.width + 10,
                                y: centerY + 3,
                                fill: theme.fg,
                                "font-size": Math.min(10, step * 0.38),
                                "text-anchor": "start"
                            },
                            formatNumber(row.end, { format: endSeries.format, decimals })
                        )
                    );
                }
            }

            // highlight (cross-filter) segment
            if (row.highlighted !== null && row.highlighted !== undefined && row.end !== null) {
                const highlightX = clamp(scale(row.highlighted), plot.x, plot.x + plot.width);
                if (endX !== null) {
                    append(
                        group,
                        svgEl("line", {
                            x1: Math.min(endX, highlightX),
                            y1: centerY,
                            x2: Math.max(endX, highlightX),
                            y2: centerY,
                            stroke: theme.accent2,
                            "stroke-width": dotSize,
                            "stroke-linecap": "round",
                            opacity: 0.3
                        })
                    );
                }
            }

            // delta
            if (showDelta) {
                const delta = row.start !== null && row.end !== null ? row.end - row.start : null;
                const percent = delta !== null && row.start ? (delta / Math.abs(row.start)) * 100 : null;
                const positive = delta !== null && delta >= 0;
                const color = delta === null ? theme.sub : positive ? theme.accent2 : "#EF6F87";
                append(
                    group,
                    svgEl(
                        "text",
                        {
                            x: plot.x + plot.width + 16,
                            y: centerY + 4,
                            fill: color,
                            "font-size": 11,
                            "font-weight": 700,
                            "text-anchor": "start"
                        },
                        delta === null
                            ? "—"
                            : `${positive ? "▲" : "▼"} ${formatNumber(Math.abs(delta), { decimals })}${percent === null ? "" : ` · ${percent.toFixed(1).replace(".", ",")}%`}`
                    )
                );
            }

            // sparkline of the row's own two points + helpers
            if (sparkWidth && row.start !== null && row.end !== null) {
                const spark = sparkline([row.start, row.end], sparkWidth, 16, theme.accent, { endDot: true });
                const foreign = this.makeForeign(svg, size.width - sparkWidth - 6, centerY - 8, spark);
                if (foreign) {
                    append(group, foreign);
                }
            }

            const tooltipItems = [
                { displayName: "Categoria", value: row.label },
                { displayName: startSeries.name, value: formatNumber(row.start, { format: startSeries.format, decimals }) },
                { displayName: endSeries.name, value: formatNumber(row.end, { format: endSeries.format, decimals }) },
                {
                    displayName: "Delta",
                    value:
                        row.start !== null && row.end !== null
                            ? `${row.end - row.start >= 0 ? "+" : ""}${formatNumber(row.end - row.start, { decimals })}`
                            : "—"
                }
            ];

            group.addEventListener("pointermove", (event: PointerEvent) => {
                this.interactions.moveTooltip(this.host, event);
                this.interactions.tooltip(this.host, event, tooltipItems, row.identity ? [row.identity] : []);
            });
            group.addEventListener("pointerleave", (event: PointerEvent) => this.interactions.hideTooltip(this.host, event));
            group.addEventListener("click", (event: MouseEvent) => {
                this.interactions.select(row.identity, event.ctrlKey || event.metaKey);
            });
            group.addEventListener("contextmenu", (event: MouseEvent) => this.interactions.contextMenu(row.identity, event));

            append(rowGroup, group);
        });
        append(svg, rowGroup);
        append(chrome.body, svg);

        if (showLegendOf(settings)) {
            const startValues = seriesValues(startSeries);
            const endValues = seriesValues(endSeries);
            renderLegend(chrome.footer, chrome, [
                { label: `${startSeries.name} (Σ ${formatNumber(sum(startValues), { decimals: 0 })})`, color: theme.palette[0] },
                { label: `${endSeries.name} (Σ ${formatNumber(sum(endValues), { decimals: 0 })})`, color: theme.accent2 }
            ]);
        }
    }

    /** SVG <foreignObject> wrapper so DOM-based helpers (sparkline) can live inside the plot. */
    private makeForeign(svg: SVGSVGElement, x: number, y: number, content: SVGElement): Element | null {
        if (typeof svg.ownerDocument === "undefined" || !svg.ownerDocument) {
            return null;
        }
        const foreign = svgEl("foreignObject", { x, y, width: 60, height: 16 });
        const wrapper = el("div");
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.height = "100%";
        append(wrapper, content);
        foreign.appendChild(wrapper);
        return foreign;
    }
}

/** Referenced by the tests through the visual module: keeps the tree shaker honest. */
export const __seriesHelpers = { seriesValues, sum, rgba, ctxGuard: (ctx: Ctx, series: Series, theme: Theme) => ctx.series.indexOf(series) >= 0 && theme.palette.length > 0 };
