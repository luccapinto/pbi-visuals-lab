/**
 * Micro-gráficos em células — cada categoria vira uma linha com um mini gráfico
 * desenhado na própria célula: barra de partida, barra de chegada, seta de
 * direção e variação percentual. Formato de "ticker" para muitos itens.
 */

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import {
    bodySize,
    buildCtx,
    clamp,
    formatCompact,
    formatNumber,
    linearScale,
    mixColors,
    optNumber,
    renderChrome,
    renderEmpty,
    rgba,
    sum
} from "../../../shared/src/kit";
import { TalosVisual } from "../../../shared/src/base";
import { BaseSettings, PresentationCard, decimalsOf, resolvedTheme, showValuesOf } from "../../../shared/src/settings";
import { append, el, svgEl, svgRoot } from "../../../shared/src/dom";

class GlyphCard extends PresentationCard {
    name: string = "glyph";
    displayName: string = "Micro-gráficos";

    rowHeight = new formattingSettings.NumUpDown({
        name: "rowHeight",
        displayName: "Altura da linha (px)",
        value: 30
    });

    barScale = new formattingSettings.ItemDropdown({
        name: "barScale",
        displayName: "Escala das barras",
        items: [
            { value: "shared", displayName: "Comum" },
            { value: "own", displayName: "Por linha" }
        ],
        value: { value: "shared", displayName: "Comum" }
    });

    slices = [
        this.theme,
        this.accent,
        this.accent2,
        this.decimals,
        this.showValues,
        this.showLegend,
        this.rowHeight,
        this.barScale
    ];
}

class GlyphSettings extends BaseSettings {
    glyph = new GlyphCard();
    cards = [this.presentation, this.glyph];
}

export class Visual extends TalosVisual {
    protected settingsModel(): { new (): formattingSettings.Model } {
        return GlyphSettings;
    }

    protected render(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        const settings = this.settings as GlyphSettings;
        const theme = resolvedTheme(settings);
        const ctx = buildCtx(options, this.host, theme);
        const decimals = decimalsOf(settings);
        const showValues = showValuesOf(settings);

        const startSeries = ctx.firstSeries("start") || ctx.series[0] || null;
        const endSeries = ctx.firstSeries("end") || ctx.series[1] || null;

        const chrome = renderChrome(this.root, theme, {
            title: "Micro-gráficos por categoria",
            subtitle: startSeries && endSeries ? `${startSeries.name} → ${endSeries.name}` : ""
        });

        if (ctx.isEmpty || !startSeries || !endSeries) {
            renderEmpty(chrome, "Adicione Categoria, Valor inicial e Valor final", "Cada linha recebe um mini gráfico com a variação");
            return;
        }

        const rows = ctx.byCategory
            .map((entry) => ({
                label: entry.label,
                start: startSeries.values[entry.index],
                end: endSeries.values[entry.index],
                identity: ctx.identities[entry.index]
            }))
            .filter((row) => row.start !== null || row.end !== null);

        const rowHeight = clamp(optNumber(settings.glyph.rowHeight.value, 30), 18, 90);
        const scaleMode = String((settings.glyph.barScale.value as { value?: string }).value || "shared");
        const size = bodySize(chrome, ctx);

        let globalMax = 1;
        for (const row of rows) {
            globalMax = Math.max(globalMax, Math.abs(row.start || 0), Math.abs(row.end || 0));
        }

        const labelWidth = clamp(size.width * 0.26, 70, 220);
        const deltaWidth = size.width > 320 ? clamp(size.width * 0.16, 62, 120) : 0;
        const glyphLeft = labelWidth + 6;
        const glyphWidth = Math.max(30, size.width - labelWidth - deltaWidth - 14);
        const visibleRows = Math.max(1, Math.floor(size.height / rowHeight));
        const visible = rows.slice(0, visibleRows);
        const selected = this.interactions.hasSelection();

        const svg = svgRoot(size.width, size.height);
        const body = svgEl("g", { class: "tl-glyph-body" });

        visible.forEach((row, position) => {
            const y = position * rowHeight;
            const isSelected = this.interactions.isSelected(row.identity);
            const opacity = selected && !isSelected ? 0.3 : 1;
            const group = svgEl("g", { opacity });
            group.style.cursor = row.identity ? "pointer" : "default";

            const startValue = row.start === null ? 0 : row.start;
            const endValue = row.end === null ? 0 : row.end;
            const rowMax = scaleMode === "shared" ? globalMax : Math.max(Math.abs(startValue), Math.abs(endValue)) || 1;
            const scaleX = linearScale(0, rowMax, 0, glyphWidth);
            const startWidth = Math.max(1, scaleX(Math.abs(startValue)));
            const endWidth = Math.max(1, scaleX(Math.abs(endValue)));
            const up = endValue >= startValue;
            const color = up ? theme.accent2 : "#EF6F87";
            const barY = y + rowHeight / 2;

            if (position % 2 === 1) {
                append(
                    group,
                    svgEl("rect", {
                        x: 0,
                        y,
                        width: size.width,
                        height: rowHeight,
                        fill: rgba(theme.grid, 0.35)
                    })
                );
            }

            append(
                group,
                svgEl(
                    "text",
                    {
                        x: labelWidth,
                        y: barY + 3,
                        fill: theme.fg,
                        "font-size": Math.min(11, rowHeight * 0.42),
                        "text-anchor": "end"
                    },
                    row.label.length > 22 ? `${row.label.slice(0, 21)}…` : row.label
                )
            );

            // start marker (ghost bar) and end bar
            append(
                group,
                svgEl("line", {
                    x1: glyphLeft + startWidth,
                    y1: barY - clamp(rowHeight * 0.26, 3, 10),
                    x2: glyphLeft + startWidth,
                    y2: barY + clamp(rowHeight * 0.26, 3, 10),
                    stroke: theme.sub,
                    "stroke-width": 1.4,
                    "stroke-dasharray": "2 2"
                })
            );
            append(
                group,
                svgEl("rect", {
                    x: glyphLeft,
                    y: barY - clamp(rowHeight * 0.16, 2, 6),
                    width: endWidth,
                    height: Math.max(3, clamp(rowHeight * 0.32, 3, 12)),
                    rx: 2,
                    fill: color,
                    "fill-opacity": 0.9
                })
            );
            const arrowSize = clamp(rowHeight * 0.24, 3, 8);
            append(
                group,
                svgEl("polygon", {
                    points: up
                        ? `${glyphLeft + endWidth + 3},${barY} ${glyphLeft + endWidth + 3 + arrowSize},${barY - arrowSize} ${glyphLeft + endWidth + 3 + arrowSize},${barY + arrowSize}`
                        : `${glyphLeft + endWidth + 3 + arrowSize},${barY} ${glyphLeft + endWidth + 3},${barY - arrowSize} ${glyphLeft + endWidth + 3},${barY + arrowSize}`,
                    fill: color
                })
            );

            if (showValues && glyphWidth > 90) {
                append(
                    group,
                    svgEl(
                        "text",
                        {
                            x: glyphLeft + Math.max(startWidth, endWidth) + arrowSize + 8,
                            y: barY + 3,
                            fill: theme.sub,
                            "font-size": 9
                        },
                        formatCompact(endValue, 1)
                    )
                );
            }

            if (deltaWidth) {
                const delta = endValue - startValue;
                const percent = startValue ? (delta / Math.abs(startValue)) * 100 : null;
                append(
                    group,
                    svgEl(
                        "text",
                        {
                            x: size.width - 2,
                            y: barY + 4,
                            fill: color,
                            "font-size": 11,
                            "font-weight": 700,
                            "text-anchor": "end"
                        },
                        `${up ? "▲" : "▼"} ${formatNumber(Math.abs(delta), { decimals })}${percent === null ? "" : ` (${percent.toFixed(1).replace(".", ",")}%)`}`
                    )
                );
            }

            const items = [
                { displayName: "Categoria", value: row.label },
                { displayName: startSeries.name, value: formatNumber(row.start, { format: startSeries.format, decimals }) },
                { displayName: endSeries.name, value: formatNumber(row.end, { format: endSeries.format, decimals }) },
                {
                    displayName: "Variação",
                    value:
                        row.start !== null && row.end !== null
                            ? `${row.end - row.start >= 0 ? "+" : ""}${formatNumber(row.end - row.start, { decimals })}`
                            : "—"
                }
            ];
            group.addEventListener("pointermove", (event: PointerEvent) => {
                this.interactions.moveTooltip(this.host, event);
                this.interactions.tooltip(this.host, event, items, row.identity ? [row.identity] : []);
            });
            group.addEventListener("pointerleave", (event: PointerEvent) => this.interactions.hideTooltip(this.host, event));
            group.addEventListener("click", (event: MouseEvent) => this.interactions.select(row.identity, event.ctrlKey || event.metaKey));
            group.addEventListener("contextmenu", (event: MouseEvent) => this.interactions.contextMenu(row.identity, event));
            append(body, group);
        });

        // header line
        const totalStart = sum(rows.map((row) => row.start || 0));
        const totalEnd = sum(rows.map((row) => row.end || 0));
        const runningUp = totalEnd >= totalStart;
        append(
            svg,
            svgEl(
                "text",
                { x: 0, y: 12, fill: theme.sub, "font-size": 10 },
                `Σ inicial ${formatCompact(totalStart, 1)} → Σ final ${formatCompact(totalEnd, 1)}`
            )
        );
        append(
            svg,
            svgEl(
                "text",
                {
                    x: size.width,
                    y: 12,
                    fill: runningUp ? theme.accent2 : "#EF6F87",
                    "font-size": 11,
                    "font-weight": 700,
                    "text-anchor": "end"
                },
                `${runningUp ? "▲" : "▼"} ${formatNumber(Math.abs(totalEnd - totalStart), { decimals })} (${totalStart ? (((totalEnd - totalStart) / Math.abs(totalStart)) * 100).toFixed(1).replace(".", ",") : "0"}%)`
            )
        );

        append(svg, body);
        append(chrome.body, svg);

        const note = el("span", { class: "tl-note" }, `${visible.length} de ${rows.length} linhas · linha do tempo: inicial → final`);
        note.style.fontSize = "10px";
        note.style.color = theme.sub;
        append(chrome.footer, note);
        void mixColors;
    }
}
