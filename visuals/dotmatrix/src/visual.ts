/**
 * Grade de pontos — cada categoria vira uma célula com uma matriz de pontos
 * proporcional ao valor, com ranking, cor por categoria e seleção cruzada.
 */

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import {
    bodySize,
    buildCtx,
    clamp,
    colorForKey,
    formatNumber,
    formatCompact,
    mixColors,
    optNumber,
    renderChrome,
    renderEmpty,
    rgba,
    sum
} from "../../../shared/src/kit";
import { TalosVisual } from "../../../shared/src/base";
import { BaseSettings, PresentationCard, decimalsOf, resolvedTheme } from "../../../shared/src/settings";
import { append, el, svgEl, svgRoot } from "../../../shared/src/dom";

class DotMatrixCard extends PresentationCard {
    name: string = "dotMatrix";
    displayName: string = "Grade de pontos";

    dotsPerCell = new formattingSettings.NumUpDown({
        name: "dotsPerCell",
        displayName: "Pontos por célula",
        value: 12
    });

    cellHeight = new formattingSettings.NumUpDown({
        name: "cellHeight",
        displayName: "Altura da célula (px)",
        value: 74
    });

    minCellWidth = new formattingSettings.NumUpDown({
        name: "minCellWidth",
        displayName: "Largura mínima da célula (px)",
        value: 168
    });

    slices = [
        this.theme,
        this.accent,
        this.accent2,
        this.decimals,
        this.showValues,
        this.showLegend,
        this.dotsPerCell,
        this.cellHeight,
        this.minCellWidth
    ];
}

class DotMatrixSettings extends BaseSettings {
    dotMatrix = new DotMatrixCard();
    cards = [this.presentation, this.dotMatrix];
}

export class Visual extends TalosVisual {
    protected settingsModel(): { new (): formattingSettings.Model } {
        return DotMatrixSettings;
    }

    protected render(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        const settings = this.settings as DotMatrixSettings;
        const theme = resolvedTheme(settings);
        const ctx = buildCtx(options, this.host, theme);
        const decimals = decimalsOf(settings);
        const measure = ctx.firstSeries("measure") || ctx.series[0] || null;

        const chrome = renderChrome(this.root, theme, {
            title: "Grade de pontos",
            subtitle: measure ? measure.name : ""
        });

        if (ctx.isEmpty || !measure) {
            renderEmpty(chrome, "Adicione Categoria e um Valor", "Cada célula mostra o valor em pontos");
            return;
        }

        const dots = clamp(Math.round(optNumber(settings.dotMatrix.dotsPerCell.value, 12)), 4, 40);
        const cellHeight = clamp(optNumber(settings.dotMatrix.cellHeight.value, 74), 48, 200);
        const minCellWidth = clamp(optNumber(settings.dotMatrix.minCellWidth.value, 168), 110, 420);

        const entries = ctx.byCategory
            .map((entry) => ({
                label: entry.label,
                value: measure.values[entry.index],
                identity: ctx.identities[entry.index]
            }))
            .filter((entry) => entry.value !== null)
            .sort((a, b) => (b.value as number) - (a.value as number));

        const maxValue = entries.reduce((best, entry) => Math.max(best, entry.value as number), 0) || 1;
        const total = sum(entries.map((entry) => entry.value as number));
        const size = bodySize(chrome, ctx);
        const columns = Math.max(1, Math.floor(size.width / minCellWidth));
        const cellWidth = size.width / columns;
        const rows = Math.ceil(entries.length / columns);
        const visibleRows = Math.max(1, Math.floor(size.height / cellHeight));
        const visible = entries.slice(0, columns * visibleRows);
        const selected = this.interactions.hasSelection();

        const svg = svgRoot(size.width, size.height);
        const grid = svgEl("g", { class: "tl-dot-grid" });

        visible.forEach((entry, position) => {
            const column = position % columns;
            const row = Math.floor(position / columns);
            const x = column * cellWidth;
            const y = row * cellHeight;
            const color = colorForKey(entry.label, theme.palette);
            const isSelected = this.interactions.isSelected(entry.identity);
            const opacity = selected && !isSelected ? 0.3 : 1;
            const group = svgEl("g", { opacity });
            group.style.cursor = entry.identity ? "pointer" : "default";

            const padding = 10;
            append(
                group,
                svgEl("rect", {
                    x: x + 2,
                    y: y + 2,
                    width: Math.max(10, cellWidth - 8),
                    height: cellHeight - 8,
                    rx: theme.radius,
                    fill: rgba(theme.card, 0.85),
                    stroke: theme.grid,
                    "stroke-width": 1
                })
            );

            append(
                group,
                svgEl(
                    "text",
                    {
                        x: x + padding,
                        y: y + 18,
                        fill: theme.fg,
                        "font-size": 11,
                        "font-weight": 600
                    },
                    entry.label.length > 20 ? `${entry.label.slice(0, 19)}…` : entry.label
                )
            );

            append(
                group,
                svgEl(
                    "text",
                    {
                        x: x + cellWidth - padding - 2,
                        y: y + 18,
                        fill: color,
                        "font-size": 12,
                        "font-weight": 700,
                        "text-anchor": "end"
                    },
                    formatCompact(entry.value as number, 1)
                )
            );

            const filled = Math.max(1, Math.round(((entry.value as number) / maxValue) * dots));
            const dotSize = clamp((cellWidth - padding * 2) / (dots * 2.2), 3, 12);
            const dotGap = dotSize * 1.35;
            for (let index = 0; index < dots; index++) {
                const dotX = x + padding + dotSize / 2 + index * dotGap;
                if (dotX + dotSize > x + cellWidth - padding) {
                    break;
                }
                const active = index < filled;
                append(
                    group,
                    svgEl("circle", {
                        cx: dotX,
                        cy: y + cellHeight - 24,
                        r: active ? dotSize : dotSize * 0.72,
                        fill: active ? color : rgba(theme.sub, 0.28),
                        opacity: active ? 0.55 + 0.45 * (1 - index / dots) : 1
                    })
                );
            }

            if (cellHeight > 62) {
                append(
                    group,
                    svgEl(
                        "text",
                        {
                            x: x + cellWidth - padding - 2,
                            y: y + cellHeight - 12,
                            fill: theme.sub,
                            "font-size": 9,
                            "text-anchor": "end"
                        },
                        `${(((entry.value as number) / total) * 100).toFixed(1).replace(".", ",")}% do total`
                    )
                );
            }

            const items = [
                { displayName: "Categoria", value: entry.label },
                { displayName: measure.name, value: formatNumber(entry.value, { format: measure.format, decimals }) },
                { displayName: "Participação", value: `${(((entry.value as number) / total) * 100).toFixed(1).replace(".", ",")}%` }
            ];
            group.addEventListener("pointermove", (event: PointerEvent) => {
                this.interactions.moveTooltip(this.host, event);
                this.interactions.tooltip(this.host, event, items, entry.identity ? [entry.identity] : []);
            });
            group.addEventListener("pointerleave", (event: PointerEvent) => this.interactions.hideTooltip(this.host, event));
            group.addEventListener("click", (event: MouseEvent) => this.interactions.select(entry.identity, event.ctrlKey || event.metaKey));
            group.addEventListener("contextmenu", (event: MouseEvent) => this.interactions.contextMenu(entry.identity, event));
            append(grid, group);
        });

        append(svg, grid);
        append(chrome.body, svg);

        const hidden = entries.length - visible.length;
        const note = el(
            "span",
            { class: "tl-note" },
            hidden > 0
                ? `${visible.length} de ${entries.length} categorias exibidas · total ${formatCompact(total, 1)}`
                : `${entries.length} categorias · total ${formatCompact(total, 1)}`
        );
        note.style.fontSize = "10px";
        note.style.color = hidden > 0 ? theme.accent : theme.sub;
        append(chrome.footer, note);
    }
}
