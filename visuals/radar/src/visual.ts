/**
 * Radar comparativo — perfil de várias medidas pelo mesmo conjunto de eixos,
 * com anéis de referência, destaque no hover e legenda que liga/desliga perfis.
 */

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import {
    Ctx,
    Series,
    bodySize,
    buildCtx,
    clamp,
    formatNumber,
    linearScale,
    mixColors,
    optBool,
    optNumber,
    renderChrome,
    renderEmpty,
    renderLegend,
    rgba
} from "../../../shared/src/kit";
import { TalosVisual } from "../../../shared/src/base";
import { BaseSettings, PresentationCard, decimalsOf, resolvedTheme, showLegendOf } from "../../../shared/src/settings";
import { append, svgEl, svgRoot } from "../../../shared/src/dom";

class RadarCard extends PresentationCard {
    name: string = "radar";
    displayName: string = "Radar";

    rings = new formattingSettings.NumUpDown({
        name: "rings",
        displayName: "Anéis de referência",
        value: 4
    });

    areaFill = new formattingSettings.ToggleSwitch({
        name: "areaFill",
        displayName: "Preencher área",
        value: true
    });

    dotSize = new formattingSettings.NumUpDown({
        name: "dotSize",
        displayName: "Tamanho dos vórtices",
        value: 3.5
    });

    slices = [
        this.theme,
        this.accent,
        this.accent2,
        this.decimals,
        this.showValues,
        this.showLegend,
        this.rings,
        this.areaFill,
        this.dotSize
    ];
}

class RadarSettings extends BaseSettings {
    radar = new RadarCard();
    cards = [this.presentation, this.radar];
}

export class Visual extends TalosVisual {
    private hidden: string[] = [];

    protected settingsModel(): { new (): formattingSettings.Model } {
        return RadarSettings;
    }

    protected render(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        const settings = this.settings as RadarSettings;
        const theme = resolvedTheme(settings);
        const ctx = buildCtx(options, this.host, theme);
        const decimals = decimalsOf(settings);
        const showValues = decimals === 0 ? false : true;

        const profiles = this.profiles(ctx);
        const chrome = renderChrome(this.root, theme, {
            title: "Radar comparativo",
            subtitle: profiles.map((profile) => profile.name).join(" · ")
        });

        if (ctx.isEmpty || !profiles.length || ctx.byCategory.length < 3) {
            renderEmpty(chrome, "Adicione Categoria e duas ou mais Medidas", "O radar precisa de pelo menos 3 eixos para desenhar o polígono");
            return;
        }

        const active = profiles.filter((profile) => this.hidden.indexOf(profile.name) < 0);
        if (!active.length) {
            renderEmpty(chrome, "Todos os perfis estão ocultos", "Clique na legenda para reativar");
            return;
        }

        const size = bodySize(chrome, ctx);
        const legendWidth = showLegendOf(settings) ? clamp(size.width * 0.26, 108, 200) : 0;
        const plotSize = Math.min(size.width - legendWidth, size.height) - 16;
        const radius = Math.max(30, plotSize / 2);
        const cx = (size.width - legendWidth) / 2;
        const cy = size.height / 2;
        const axes = ctx.byCategory;
        const rings = clamp(Math.round(optNumber(settings.radar.rings.value, 4)), 1, 8);
        const fill = optBool(settings.radar.areaFill.value, true);
        const dotSize = clamp(optNumber(settings.radar.dotSize.value, 3.5), 1, 10);

        // Normalisation: every profile is scaled against the overall max so shapes are comparable.
        let globalMax = 0;
        for (const profile of active) {
            for (const entry of axes) {
                const value = profile.values[entry.index];
                if (value !== null && isFinite(value)) {
                    globalMax = Math.max(globalMax, Math.abs(value));
                }
            }
        }
        globalMax = globalMax || 1;
        const radiusFor = linearScale(0, globalMax, 0, radius);

        const svg = svgRoot(size.width, size.height);
        const grid = svgEl("g", { class: "tl-radar-grid" });
        const angleAt = (index: number): number => (index / axes.length) * Math.PI * 2 - Math.PI / 2;

        for (let ring = 1; ring <= rings; ring++) {
            const ringRadius = (radius * ring) / rings;
            const points: string[] = [];
            for (let index = 0; index < axes.length; index++) {
                const angle = angleAt(index);
                points.push(`${(cx + ringRadius * Math.cos(angle)).toFixed(2)},${(cy + ringRadius * Math.sin(angle)).toFixed(2)}`);
            }
            append(
                grid,
                svgEl("polygon", {
                    points: points.join(" "),
                    fill: "none",
                    stroke: theme.grid,
                    "stroke-width": 1,
                    "stroke-dasharray": ring === rings ? "" : "3 4"
                })
            );
        }

        axes.forEach((entry, index) => {
            const angle = angleAt(index);
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            append(grid, svgEl("line", { x1: cx, y1: cy, x2: x, y2: y, stroke: theme.grid, "stroke-width": 1 }));
            const labelX = cx + (radius + 14) * Math.cos(angle);
            const labelY = cy + (radius + 14) * Math.sin(angle);
            let anchor = "middle";
            if (Math.cos(angle) > 0.35) {
                anchor = "start";
            } else if (Math.cos(angle) < -0.35) {
                anchor = "end";
            }
            append(
                grid,
                svgEl(
                    "text",
                    {
                        x: labelX,
                        y: labelY + 3,
                        fill: theme.fg,
                        "font-size": 10,
                        "text-anchor": anchor
                    },
                    entry.label.length > 16 ? `${entry.label.slice(0, 15)}…` : entry.label
                )
            );
        });
        append(svg, grid);

        active.forEach((profile, profileIndex) => {
            const color = theme.palette[profileIndex % theme.palette.length];
            const points: { x: number; y: number; value: number | null; entryIndex: number }[] = [];
            for (const entry of axes) {
                const value = profile.values[entry.index];
                const angle = angleAt(axes.indexOf(entry));
                const magnitude = value === null ? 0 : clamp(radiusFor(Math.abs(value)), 0, radius);
                points.push({
                    x: cx + magnitude * Math.cos(angle),
                    y: cy + magnitude * Math.sin(angle),
                    value,
                    entryIndex: entry.index
                });
            }
            const polygon = svgEl("polygon", {
                points: points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "),
                fill: fill ? rgba(color, 0.14) : "none",
                stroke: color,
                "stroke-width": 2,
                "stroke-linejoin": "round"
            });
            polygon.style.transition = "opacity .2s ease";
            append(svg, polygon);

            points.forEach((point) => {
                const identity = ctx.identities[point.entryIndex];
                const dot = svgEl("circle", {
                    cx: point.x,
                    cy: point.y,
                    r: dotSize,
                    fill: theme.bg,
                    stroke: color,
                    "stroke-width": 2
                });
                dot.style.cursor = identity ? "pointer" : "default";
                const items = [
                    { displayName: "Eixo", value: axes.find((axis) => axis.index === point.entryIndex)?.label || "" },
                    { displayName: profile.name, value: formatNumber(point.value, { format: profile.format, decimals }) }
                ];
                dot.addEventListener("pointerenter", () => {
                    dot.setAttribute("r", String(dotSize * 1.8));
                });
                dot.addEventListener("pointermove", (event: PointerEvent) => {
                    this.interactions.moveTooltip(this.host, event);
                    this.interactions.tooltip(this.host, event, items, identity ? [identity] : []);
                });
                dot.addEventListener("pointerleave", (event: PointerEvent) => {
                    dot.setAttribute("r", String(dotSize));
                    this.interactions.hideTooltip(this.host, event);
                });
                dot.addEventListener("click", (event: MouseEvent) => this.interactions.select(identity, event.ctrlKey || event.metaKey));
                dot.addEventListener("contextmenu", (event: MouseEvent) => this.interactions.contextMenu(identity, event));
                append(svg, dot);
            });

            if (showValues && size.width > 420) {
                const last = points[points.length - 1];
                append(
                    svg,
                    svgEl(
                        "text",
                        { x: last.x + 8, y: last.y, fill: color, "font-size": 9, "font-weight": 700 },
                        formatNumber(profile.values[axes[axes.length - 1].index], { format: profile.format, decimals })
                    )
                );
            }
        });

        append(chrome.body, svg);

        if (showLegendOf(settings)) {
            const host = chrome.footer;
            host.style.flexDirection = "column";
            host.style.alignItems = "flex-start";
            renderLegend(
                host,
                chrome,
                profiles.map((profile, index) => ({
                    label: `${profile.name}${this.hidden.indexOf(profile.name) >= 0 ? " (oculto)" : ""}`,
                    color: theme.palette[index % theme.palette.length],
                    shape: "line" as const,
                    muted: this.hidden.indexOf(profile.name) >= 0
                })),
                (item) => {
                    const name = item.label.replace(" (oculto)", "");
                    const position = this.hidden.indexOf(name);
                    if (position >= 0) {
                        this.hidden.splice(position, 1);
                    } else if (this.hidden.length < profiles.length - 1) {
                        this.hidden.push(name);
                    }
                    this.rerender();
                }
            );
        }

        const note = svgEl("text", {});
        note.textContent = "";
        chrome.subEl.textContent = `máx. eixo ${formatNumber(globalMax, { decimals: 1 })} · ${axes.length} eixos · ${active.length} perfis`;
        void mixColors;
    }

    private profiles(ctx: Ctx): Series[] {
        const declared = ["measure", "measure2", "measure3", "measure4"];
        const found: Series[] = [];
        for (const role of declared) {
            for (const series of ctx.seriesFor(role)) {
                found.push(series);
            }
        }
        if (found.length) {
            return found.slice(0, 4);
        }
        return ctx.series.filter((item) => item.values.some((value) => value !== null)).slice(0, 4);
    }
}
