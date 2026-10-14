/**
 * Anel de progresso — donut de participação com KPI central, segmento que se
 * destaca no hover e seleção cruzada por categoria.
 */

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import {
    arcPath,
    bodySize,
    buildCtx,
    clamp,
    colorForKey,
    formatNumber,
    formatCompact,
    mixColors,
    optBool,
    optNumber,
    renderChrome,
    renderEmpty,
    renderLegend,
    rgba,
    sum
} from "../../../shared/src/kit";
import { TalosVisual } from "../../../shared/src/base";
import { BaseSettings, PresentationCard, decimalsOf, resolvedTheme, showLegendOf, showValuesOf } from "../../../shared/src/settings";
import { append, svgEl, svgRoot } from "../../../shared/src/dom";

class RingCard extends PresentationCard {
    name: string = "ring";
    displayName: string = "Anel";

    thickness = new formattingSettings.NumUpDown({
        name: "thickness",
        displayName: "Espessura do anel (%)",
        value: 34
    });

    gapDegrees = new formattingSettings.NumUpDown({
        name: "gapDegrees",
        displayName: "Espaço entre fatias (graus)",
        value: 1.5
    });

    showCenterKpi = new formattingSettings.ToggleSwitch({
        name: "showCenterKpi",
        displayName: "KPI no centro",
        value: true
    });

    maxSlices = new formattingSettings.NumUpDown({
        name: "maxSlices",
        displayName: "Máximo de fatias",
        value: 8
    });

    slices = [
        this.theme,
        this.accent,
        this.accent2,
        this.decimals,
        this.showValues,
        this.showLegend,
        this.thickness,
        this.gapDegrees,
        this.showCenterKpi,
        this.maxSlices
    ];
}

class RingSettings extends BaseSettings {
    ring = new RingCard();
    cards = [this.presentation, this.ring];
}

export class Visual extends TalosVisual {
    protected settingsModel(): { new (): formattingSettings.Model } {
        return RingSettings;
    }

    protected render(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        const settings = this.settings as RingSettings;
        const theme = resolvedTheme(settings);
        const ctx = buildCtx(options, this.host, theme);
        const decimals = decimalsOf(settings);
        const measure = ctx.firstSeries("measure") || ctx.series[0] || null;

        const chrome = renderChrome(this.root, theme, {
            title: "Anel de participação",
            subtitle: measure ? measure.name : ""
        });

        if (ctx.isEmpty || !measure) {
            renderEmpty(chrome, "Adicione Categoria e um Valor", "O anel mostra a participação de cada categoria no total");
            return;
        }

        const maxSlices = clamp(Math.round(optNumber(settings.ring.maxSlices.value, 8)), 2, 20);
        const entries = ctx.byCategory
            .map((entry) => ({
                label: entry.label,
                index: entry.index,
                value: measure.values[entry.index],
                identity: ctx.identities[entry.index]
            }))
            .filter((entry) => entry.value !== null && entry.value > 0)
            .sort((a, b) => (b.value as number) - (a.value as number));

        const top = entries.slice(0, maxSlices);
        if (entries.length > maxSlices) {
            const rest = entries.slice(maxSlices);
            top.push({
                label: "Outros",
                index: -1,
                value: sum(rest.map((entry) => entry.value as number)),
                identity: null
            });
        }
        const total = sum(top.map((entry) => entry.value as number));
        if (!total) {
            renderEmpty(chrome, "Sem valores positivos para somar", undefined);
            return;
        }

        const size = bodySize(chrome, ctx);
        const showCenter = optBool(settings.ring.showCenterKpi.value, true);
        const showLegend = showLegendOf(settings);
        // O anel ocupa o corpo inteiro; a legenda fica no rodapé, em linha.
        const plotWidth = Math.max(80, size.width);
        const diameter = Math.max(40, Math.min(plotWidth, size.height) - 12);
        const outer = diameter / 2;
        const thickness = clamp(optNumber(settings.ring.thickness.value, 34), 8, 70) / 100;
        const inner = outer * (1 - thickness);
        const cx = plotWidth / 2;
        const cy = size.height / 2;
        const gap = (clamp(optNumber(settings.ring.gapDegrees.value, 1.5), 0, 12) * Math.PI) / 180;

        const svg = svgRoot(size.width, size.height);
        const selected = this.interactions.hasSelection();

        // Angles live in the standard math orientation (0 = 3 o'clock); arcPath rotates by -90°.
        let angle = -Math.PI / 2;
        const segments: { label: string; color: string; from: number; to: number; value: number; identity: (typeof top)[number]["identity"] }[] = [];
        for (const entry of top) {
            const sweep = ((entry.value as number) / total) * Math.PI * 2;
            const from = angle + gap / 2;
            const to = angle + sweep - gap / 2;
            segments.push({
                label: entry.label,
                color: colorForKey(entry.label, theme.palette),
                from,
                to: Math.max(from + 0.002, to),
                value: entry.value as number,
                identity: entry.identity
            });
            angle += sweep;
        }

        const group = svgEl("g", { class: "tl-ring" });
        let hovered: number | null = null;
        const paths: SVGPathElement[] = [];
        const centerValue = svgEl("text", {
            x: cx,
            y: cy + 2,
            fill: theme.fg,
            "font-size": Math.max(11, Math.min(inner * 0.52, cx * 0.4)),
            "font-weight": 700,
            "text-anchor": "middle"
        });
        const centerLabel = svgEl("text", {
            x: cx,
            y: cy + Math.max(14, Math.min(inner * 0.28, cx * 0.26)),
            fill: theme.sub,
            "font-size": 10,
            "text-anchor": "middle"
        });

        const paint = (): void => {
            const focus = hovered;
            centerValue.textContent =
                focus === null
                    ? showCenter
                        ? formatCompact(total, 1)
                        : ""
                    : showCenter
                      ? formatNumber(segments[focus].value, { format: measure.format, decimals: 0 })
                      : "";
            centerLabel.textContent =
                focus === null ? (showCenter ? measure.name : "") : segments[focus].label;
            paths.forEach((path, position) => {
                const isHovered = focus === position;
                const identity = segments[position].identity;
                const isSelected = this.interactions.isSelected(identity);
                const dimmed = (selected && !isSelected) || (focus !== null && !isHovered);
                path.style.opacity = dimmed ? "0.35" : "1";
                const offset = isHovered ? 6 : 0;
                path.setAttribute("transform", offsetRow(segments[position], cx, cy, offset));
            });
        };

        segments.forEach((segment, position) => {
            const path = svgEl("path", {
                d: arcPath(cx, cy, inner, outer, segment.from, segment.to),
                fill: segment.color,
                stroke: theme.bg,
                "stroke-width": 1.2
            }) as SVGPathElement;
            path.style.cursor = segment.identity ? "pointer" : "default";
            path.style.transition = "opacity .15s";
            const share = ((segment.value / total) * 100).toFixed(1).replace(".", ",");
            const items = [
                { displayName: "Categoria", value: segment.label },
                { displayName: measure.name, value: formatNumber(segment.value, { format: measure.format, decimals }) },
                { displayName: "Participação", value: `${share}%` }
            ];
            path.addEventListener("pointerenter", () => {
                hovered = position;
                paint();
            });
            path.addEventListener("pointermove", (event: PointerEvent) => {
                this.interactions.moveTooltip(this.host, event);
                this.interactions.tooltip(this.host, event, items, segment.identity ? [segment.identity] : []);
            });
            path.addEventListener("pointerleave", (event: PointerEvent) => {
                hovered = null;
                paint();
                this.interactions.hideTooltip(this.host, event);
            });
            path.addEventListener("click", (event: MouseEvent) => this.interactions.select(segment.identity, event.ctrlKey || event.metaKey));
            path.addEventListener("contextmenu", (event: MouseEvent) => this.interactions.contextMenu(segment.identity, event));
            paths.push(path);
            append(group, path);
        });

        append(group, svgEl("circle", { cx, cy, r: inner - 2, fill: rgba(theme.card, 0.55) }));
        if (showCenter) {
            append(group, centerValue, centerLabel);
        }
        append(svg, group);
        append(chrome.body, svg);
        paint();

        if (showLegend) {
            const legendHost = chrome.footer;
            renderLegend(legendHost, chrome, segments.map((segment) => ({
                label: `${segment.label} — ${formatCompact(segment.value, 1)} (${((segment.value / total) * 100).toFixed(0)}%)`,
                color: segment.color
            })));
        }

        if (showValuesOf(settings)) {
            chrome.subEl.textContent = `${measure.name} · total ${formatNumber(total, { format: measure.format, decimals: 0 })}`;
        }
    }
}

/** Pushes a hovered segment slightly away from the centre. */
function offsetRow(
    segment: { from: number; to: number },
    cx: number,
    cy: number,
    offset: number
): string {
    if (!offset) {
        return "";
    }
    const middle = (segment.from + segment.to) / 2;
    return `translate(${(Math.cos(middle) * offset).toFixed(2)},${(Math.sin(middle) * offset).toFixed(2)})`;
}
