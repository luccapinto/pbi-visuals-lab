/**
 * Bandas de horizonte — série temporal comprimida em faixas sobrepostas
 * (técnica de horizon chart): positivo para cima, negativo para baixo, com
 * camadas de opacidade por faixa e leitura exata no hover.
 */

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import {
    Ctx,
    GroupedSeries,
    Series,
    bodySize,
    buildCtx,
    clamp,
    formatCompact,
    formatNumber,
    linearScale,
    optNumber,
    renderChrome,
    renderEmpty,
    renderLegend,
    rgba
} from "../../../shared/src/kit";
import { TalosVisual } from "../../../shared/src/base";
import { BaseSettings, PresentationCard, decimalsOf, resolvedTheme, showLegendOf } from "../../../shared/src/settings";
import { append, el, svgEl, svgRoot } from "../../../shared/src/dom";

class HorizonCard extends PresentationCard {
    name: string = "horizon";
    displayName: string = "Bandas de horizonte";

    bands = new formattingSettings.NumUpDown({
        name: "bands",
        displayName: "Faixas por banda",
        value: 3
    });

    bandHeight = new formattingSettings.NumUpDown({
        name: "bandHeight",
        displayName: "Altura mínima da banda (px)",
        value: 46
    });

    scaleMode = new formattingSettings.ItemDropdown({
        name: "scaleMode",
        displayName: "Escala",
        items: [
            { value: "shared", displayName: "Comum a todas as bandas" },
            { value: "own", displayName: "Por banda" }
        ],
        value: { value: "own", displayName: "Por banda" }
    });

    slices = [
        this.theme,
        this.accent,
        this.accent2,
        this.decimals,
        this.showValues,
        this.showLegend,
        this.bands,
        this.bandHeight,
        this.scaleMode
    ];
}

class HorizonSettings extends BaseSettings {
    horizon = new HorizonCard();
    cards = [this.presentation, this.horizon];
}

interface Band {
    label: string;
    color: string;
    values: (number | null)[];
    format: string;
}

export class Visual extends TalosVisual {
    private animateOffset = 0;

    protected settingsModel(): { new (): formattingSettings.Model } {
        return HorizonSettings;
    }

    protected render(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        const settings = this.settings as HorizonSettings;
        const theme = resolvedTheme(settings);
        const ctx = buildCtx(options, this.host, theme);
        const decimals = decimalsOf(settings);

        const chrome = renderChrome(this.root, theme, {
            title: "Bandas de horizonte",
            subtitle: ctx.groups.length > 1 ? `${ctx.groups.length} séries` : ctx.series.length ? ctx.series.map((item) => item.name).join(" · ") : ""
        });

        if (ctx.isEmpty) {
            renderEmpty(chrome, "Adicione Eixo, Série (opcional) e Valor", "Cada série virá numa faixa com camadas de horizonte");
            return;
        }

        const bands = this.collectBands(ctx);
        if (!bands.length) {
            renderEmpty(chrome, "Sem valores numéricos para plotar", undefined);
            return;
        }

        const layers = clamp(Math.round(optNumber(settings.horizon.bands.value, 3)), 1, 4);
        const minBandHeight = clamp(optNumber(settings.horizon.bandHeight.value, 46), 24, 200);
        const scaleMode = String((settings.horizon.scaleMode.value as { value?: string }).value || "own");

        const size = bodySize(chrome, ctx);
        const labelWidth = clamp(size.width * 0.16, 60, 150);
        const valueWidth = size.width > 420 ? clamp(size.width * 0.12, 52, 96) : 0;
        const plotWidth = Math.max(40, size.width - labelWidth - valueWidth - 12);
        const bandHeight = Math.max(minBandHeight, size.height / bands.length);
        const visibleBands = bands.slice(0, Math.max(1, Math.floor(size.height / bandHeight)));
        const step = plotWidth / Math.max(1, ctx.cats.length - 1);

        const sharedMax = visibleBands.reduce(
            (best, band) => Math.max(best, ...band.values.filter((value): value is number => value !== null && isFinite(value)).map((value) => Math.abs(value)), 1),
            1
        );

        const svg = svgRoot(size.width, size.height);
        const kind = ctx.table && ctx.tableGroups.length > 1 ? "table" : ctx.groups.length > 1 ? "grouped" : "measures";

        visibleBands.forEach((band, bandIndex) => {
            const top = bandIndex * bandHeight;
            const midY = top + bandHeight / 2;
            const half = bandHeight / 2 - 6;
            const ownMax = band.values.reduce(
                (best, value) => Math.max(best, value === null || !isFinite(value) ? 0 : Math.abs(value)),
                0
            );
            const scaleMax = scaleMode === "shared" ? sharedMax : ownMax || 1;
            const scaleY = linearScale(0, scaleMax, 0, half);

            append(
                svg,
                svgEl("rect", {
                    x: labelWidth,
                    y: top + 2,
                    width: plotWidth,
                    height: bandHeight - 4,
                    fill: rgba(theme.card, 0.5),
                    rx: theme.radius
                })
            );
            append(
                svg,
                svgEl("line", { x1: labelWidth, y1: midY, x2: labelWidth + plotWidth, y2: midY, stroke: theme.grid, "stroke-width": 1 })
            );
            append(
                svg,
                svgEl(
                    "text",
                    { x: labelWidth - 8, y: midY + 4, fill: theme.fg, "font-size": 10, "text-anchor": "end", "font-weight": 600 },
                    band.label.length > 18 ? `${band.label.slice(0, 17)}…` : band.label
                )
            );

            // horizon layers: the curve is folded into N stacked strips of growing opacity
            for (let layer = 0; layer < layers; layer++) {
                const low = (scaleMax / layers) * layer;
                const high = (scaleMax / layers) * (layer + 1);
                const topPath = this.layerPath(band.values, ctx, labelWidth, step, midY, scaleY, low, high, -1);
                const layerOpacity = 0.18 + (layer / Math.max(1, layers - 1 || 1)) * 0.62;
                if (topPath) {
                    append(svg, svgEl("path", { d: topPath, fill: theme.accent, "fill-opacity": layerOpacity }));
                }
                const bottomPath = this.layerPath(band.values, ctx, labelWidth, step, midY, scaleY, low, high, 1);
                if (bottomPath) {
                    append(svg, svgEl("path", { d: bottomPath, fill: "#EF6F87", "fill-opacity": layerOpacity }));
                }
            }

            const numeric = band.values.filter((value): value is number => value !== null && isFinite(value));
            const last = numeric.length ? numeric[numeric.length - 1] : null;
            if (valueWidth) {
                append(
                    svg,
                    svgEl(
                        "text",
                        {
                            x: size.width - 4,
                            y: midY + 4,
                            fill: theme.fg,
                            "font-size": 11,
                            "font-weight": 700,
                            "text-anchor": "end"
                        },
                        formatCompact(last, 1)
                    )
                );
            }

            // hover crosshair + tooltip
            const hit = svgEl("rect", {
                x: labelWidth,
                y: top + 2,
                width: plotWidth,
                height: bandHeight - 4,
                fill: "transparent",
                "pointer-events": "all"
            });
            hit.style.cursor = "crosshair";
            hit.addEventListener("pointermove", (event: PointerEvent) => {
                const rect = this.root.getBoundingClientRect();
                const offsetX = event.clientX - rect.left - labelWidth;
                const index = clamp(Math.round(offsetX / (step || 1)), 0, ctx.cats.length - 1);
                this.showCrosshair(svg, labelWidth, index * step, top + 2, bandHeight - 4, theme);
                const value = band.values[index];
                const items = [
                    { displayName: "Eixo", value: ctx.cats[index] || String(index + 1) },
                    { displayName: band.label, value: formatNumber(value === undefined ? null : value, { format: band.format, decimals }) }
                ];
                this.interactions.moveTooltip(this.host, event);
                this.interactions.tooltip(this.host, event, items, []);
            });
            hit.addEventListener("pointerleave", (event: PointerEvent) => {
                this.clearCrosshair(svg);
                this.interactions.hideTooltip(this.host, event);
            });
            append(svg, hit);
        });

        append(chrome.body, svg);

        if (showLegendOf(settings)) {
            renderLegend(
                chrome.footer,
                chrome,
                visibleBands.map((band) => ({ label: band.label, color: theme.accent, shape: "line" as const }))
            );
        }
        const note = el("span", { class: "tl-note" }, `escala: ${scaleMode === "shared" ? "comum" : "por banda"} · fonte: ${kind === "table" ? "tabela" : kind === "grouped" ? "séries" : "medidas"}`);
        note.style.fontSize = "10px";
        note.style.color = theme.sub;
        append(chrome.footer, note);
    }

    private collectBands(ctx: Ctx): Band[] {
        const palette = ctx.theme.palette;
        if (ctx.groups.length > 1) {
            return ctx.groups.map((group: GroupedSeries, index: number) => {
                const measure = group.series.find((item) => item.role === "measure") || group.series[0];
                return {
                    label: group.name,
                    color: palette[index % palette.length],
                    values: measure.values,
                    format: measure.format
                };
            });
        }
        if (ctx.tableGroups.length > 1) {
            const source = ctx.tableGroups[0];
            const target = ctx.tableGroups[1];
            const measure = ctx.series.find((item) => item.values.some((value) => value !== null)) || null;
            if (measure) {
                const labels: string[] = [];
                const values: (number | null)[] = [];
                for (let index = 0; index < source.labels.length; index++) {
                    const label = source.labels[index];
                    const position = labels.indexOf(label);
                    const aggregate = measure.values[index];
                    if (position < 0) {
                        labels.push(label);
                        values.push(aggregate);
                    } else {
                        values[position] = (values[position] || 0) + (aggregate || 0);
                    }
                }
                return [{ label: measure.name, color: palette[0], values, format: measure.format }];
            }
        }
        return ctx.series
            .filter((item: Series) => item.values.some((value) => value !== null))
            .map((item, index) => ({ label: item.name, color: palette[index % palette.length], values: item.values, format: item.format }));
    }

    private layerPath(
        values: (number | null)[],
        ctx: Ctx,
        left: number,
        step: number,
        midY: number,
        scaleY: (value: number) => number,
        low: number,
        high: number,
        direction: 1 | -1
    ): string {
        let path = "";
        let open = false;
        values.forEach((value, index) => {
            if (value === null || !isFinite(value)) {
                return;
            }
            const magnitude = Math.abs(value);
            const sign = value >= 0 ? 1 : -1;
            if (sign !== direction) {
                return;
            }
            const capped = clamp(magnitude, low, high) - low;
            const x = left + index * step;
            const y = midY - sign * (scaleY(low) + scaleY(capped));
            if (!open) {
                path += `M${x.toFixed(2)},${midY.toFixed(2)}L${x.toFixed(2)},${y.toFixed(2)}`;
                open = true;
            } else {
                path += `L${x.toFixed(2)},${y.toFixed(2)}`;
            }
        });
        if (open) {
            const lastIndex = values.length - 1;
            path += `L${(left + lastIndex * step).toFixed(2)},${midY.toFixed(2)}Z`;
        }
        return path;
    }

    private showCrosshair(svg: SVGSVGElement, left: number, offset: number, top: number, height: number, theme: { accent: string }): void {
        this.clearCrosshair(svg);
        const line = svgEl("line", {
            x1: left + offset,
            y1: top,
            x2: left + offset,
            y2: top + height,
            stroke: theme.accent,
            "stroke-width": 1,
            class: "tl-crosshair",
            "pointer-events": "none"
        });
        svg.appendChild(line);
    }

    private clearCrosshair(svg: SVGSVGElement): void {
        const existing = svg.querySelectorAll(".tl-crosshair");
        for (let index = 0; index < existing.length; index++) {
            const node = existing[index];
            if (node.parentNode) {
                node.parentNode.removeChild(node);
            }
        }
    }
}

export const __unusedOffset = (visual: Visual): number => visual["animateOffset"];
