/**
 * Fluxo (Sankey) — caminhos entre origem e destino ponderados por uma medida,
 * com nós proporcionais, realce do caminho no hover e seleção por linha.
 */

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { sankey, sankeyLinkHorizontal, sankeyJustify, sankeyLeft, sankeyRight, sankeyCenter } from "d3-sankey";

import {
    Ctx,
    bodySize,
    buildCtx,
    clamp,
    colorForKey,
    formatCompact,
    formatNumber,
    mixColors,
    optNumber,
    renderChrome,
    renderEmpty,
    rgba
} from "../../../shared/src/kit";
import { TalosVisual } from "../../../shared/src/base";
import { BaseSettings, PresentationCard, decimalsOf, resolvedTheme } from "../../../shared/src/settings";
import { append, el, svgEl, svgRoot } from "../../../shared/src/dom";

class SankeyCard extends PresentationCard {
    name: string = "sankey";
    displayName: string = "Fluxo";

    nodeWidth = new formattingSettings.NumUpDown({
        name: "nodeWidth",
        displayName: "Largura do nó (px)",
        value: 12
    });

    nodePadding = new formattingSettings.NumUpDown({
        name: "nodePadding",
        displayName: "Espaço entre nós (px)",
        value: 14
    });

    alignment = new formattingSettings.ItemDropdown({
        name: "alignment",
        displayName: "Alinhamento dos nós",
        items: [
            { value: "justify", displayName: "Distribuído" },
            { value: "left", displayName: "À esquerda" },
            { value: "right", displayName: "À direita" },
            { value: "center", displayName: "Centralizado" }
        ],
        value: { value: "justify", displayName: "Distribuído" }
    });

    slices = [
        this.theme,
        this.accent,
        this.accent2,
        this.decimals,
        this.showValues,
        this.showLegend,
        this.nodeWidth,
        this.nodePadding,
        this.alignment
    ];
}

class SankeySettings extends BaseSettings {
    sankey = new SankeyCard();
    cards = [this.presentation, this.sankey];
}

interface FlowNode {
    id: string;
    name: string;
    depth?: number;
    x0?: number;
    x1?: number;
    y0?: number;
    y1?: number;
    value?: number;
}

interface FlowLink {
    source: string | number | FlowNode;
    target: string | number | FlowNode;
    value: number;
    /** Row identity so clicking a ribbon selects the underlying data point. */
    identity: powerbi.visuals.ISelectionId | null;
    label: string;
}

export class Visual extends TalosVisual {
    protected settingsModel(): { new (): formattingSettings.Model } {
        return SankeySettings;
    }

    protected render(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        const settings = this.settings as SankeySettings;
        const theme = resolvedTheme(settings);
        const ctx = buildCtx(options, this.host, theme);
        const decimals = decimalsOf(settings);

        const chrome = renderChrome(this.root, theme, { title: "Fluxo entre origem e destino", subtitle: "" });

        const flows = this.collectFlows(ctx);
        if (!flows.length) {
            renderEmpty(chrome, "Adicione Origem, Destino e Valor", "Uma linha por caminho (origem → destino) com o valor transportado");
            return;
        }

        const size = bodySize(chrome, ctx);
        const nodeWidth = clamp(optNumber(settings.sankey.nodeWidth.value, 12), 3, 40);
        const nodePadding = clamp(optNumber(settings.sankey.nodePadding.value, 14), 2, 60);
        const alignmentKey = String((settings.sankey.alignment.value as { value?: string }).value || "justify");
        const align = alignmentKey === "left" ? sankeyLeft : alignmentKey === "right" ? sankeyRight : alignmentKey === "center" ? sankeyCenter : sankeyJustify;

        const nodeNames: string[] = [];
        for (const flow of flows) {
            if (nodeNames.indexOf(flow.source) < 0) {
                nodeNames.push(flow.source);
            }
            if (nodeNames.indexOf(flow.target) < 0) {
                nodeNames.push(flow.target);
            }
        }
        const nodes: FlowNode[] = nodeNames.map((name) => ({ id: name, name }));
        // With nodeId() set, d3-sankey resolves links by node id, so we pass the names.
        const links: FlowLink[] = flows.map((flow) => ({
            source: flow.source,
            target: flow.target,
            value: Math.max(0.0001, Math.abs(flow.value)),
            identity: flow.identity,
            label: `${flow.source} → ${flow.target}`
        }));

        const generator = sankey<FlowNode, FlowLink>()
            .nodeId((node: FlowNode) => node.name)
            .nodeWidth(nodeWidth)
            .nodePadding(nodePadding)
            .nodeAlign(align)
            .extent([
                [4, 8],
                [Math.max(80, size.width - 4), Math.max(40, size.height - 8)]
            ]);

        let graph;
        try {
            graph = generator({ nodes, links });
        } catch (error) {
            renderEmpty(
                chrome,
                "Não foi possível calcular o fluxo",
                error instanceof Error ? error.message : String(error)
            );
            return;
        }

        const total = flows.reduce((sum, flow) => sum + Math.abs(flow.value), 0);
        chrome.subEl.textContent = `${nodes.length} nós · ${links.length} caminhos · total ${formatCompact(total, 1)}`;

        const svg = svgRoot(size.width, size.height);
        const linkGroup = svgEl("g", { class: "tl-links" });
        const nodeGroup = svgEl("g", { class: "tl-nodes" });
        const pathFor = sankeyLinkHorizontal<FlowNode, FlowLink>();

        graph.links.forEach((link) => {
            const sourceNode = link.source as unknown as FlowNode;
            const targetNode = link.target as unknown as FlowNode;
            const sourceColor = colorForKey(sourceNode.name, theme.palette);
            const targetColor = colorForKey(targetNode.name, theme.palette);
            const width = Math.max(1, link.width || 1);
            const gradientId = `sk-${this.host.instanceId || "v"}-${Math.round(width)}-${sourceNode.x0 || 0}-${targetNode.x0 || 0}`;
            const d = pathFor(link) || "";
            const path = svgEl("path", {
                d,
                fill: "none",
                stroke: mixColors(sourceColor, targetColor, 0.5),
                "stroke-width": width,
                "stroke-opacity": 0.35,
                "stroke-linecap": "butt"
            }) as SVGPathElement;
            path.style.transition = "stroke-opacity .15s ease";
            path.style.cursor = "pointer";
            const originalOpacity = 0.35;

            const items = [
                { displayName: "Caminho", value: link.label },
                { displayName: "Valor", value: formatNumber(link.value, { decimals }) }
            ];
            const highlight = (): void => {
                path.setAttribute("stroke-opacity", "0.85");
                graph.links.forEach((other) => {
                    const otherPath = linkGroup.querySelector(`[data-link="${String(graph.links.indexOf(other))}"]`);
                    if (otherPath && other !== link) {
                        otherPath.setAttribute("stroke-opacity", "0.08");
                    }
                });
            };
            const reset = (): void => {
                graph.links.forEach((other) => {
                    const otherPath = linkGroup.querySelector(`[data-link="${String(graph.links.indexOf(other))}"]`);
                    if (otherPath) {
                        otherPath.setAttribute("stroke-opacity", String(originalOpacity));
                    }
                });
            };
            path.setAttribute("data-link", String(graph.links.indexOf(link)));
            path.addEventListener("pointerenter", highlight);
            path.addEventListener("pointermove", (event: PointerEvent) => {
                this.interactions.moveTooltip(this.host, event);
                this.interactions.tooltip(this.host, event, items, link.identity ? [link.identity] : []);
            });
            path.addEventListener("pointerleave", (event: PointerEvent) => {
                reset();
                this.interactions.hideTooltip(this.host, event);
            });
            path.addEventListener("click", (event: MouseEvent) => this.interactions.select(link.identity, event.ctrlKey || event.metaKey));
            path.addEventListener("contextmenu", (event: MouseEvent) => this.interactions.contextMenu(link.identity, event));
            append(linkGroup, path);
            void gradientId;
        });
        append(svg, linkGroup);

        graph.nodes.forEach((node) => {
            const color = colorForKey(node.name, theme.palette);
            const width = (node.x1 || 0) - (node.x0 || 0);
            const height = Math.max(1, (node.y1 || 0) - (node.y0 || 0));
            const rect = svgEl("rect", {
                x: node.x0,
                y: node.y0,
                width: Math.max(1, width),
                height,
                rx: Math.min(3, theme.radius),
                fill: color,
                stroke: theme.bg,
                "stroke-width": 1
            });
            rect.style.cursor = "pointer";
            const inflow = (node.value || 0);
            const items = [
                { displayName: "Nó", value: node.name },
                { displayName: "Fluxo no nó", value: formatNumber(inflow, { decimals }) }
            ];
            rect.addEventListener("pointerenter", () => {
                rect.setAttribute("opacity", "0.82");
                graph.links.forEach((link) => {
                    const sourceNode = link.source as unknown as FlowNode;
                    const targetNode = link.target as unknown as FlowNode;
                    const related = sourceNode.name === node.name || targetNode.name === node.name;
                    const otherPath = linkGroup.querySelector(`[data-link="${String(graph.links.indexOf(link))}"]`);
                    if (otherPath) {
                        otherPath.setAttribute("stroke-opacity", related ? "0.8" : "0.06");
                    }
                });
            });
            rect.addEventListener("pointermove", (event: PointerEvent) => {
                this.interactions.moveTooltip(this.host, event);
                this.interactions.tooltip(this.host, event, items, []);
            });
            rect.addEventListener("pointerleave", (event: PointerEvent) => {
                rect.setAttribute("opacity", "1");
                graph.links.forEach((link) => {
                    const otherPath = linkGroup.querySelector(`[data-link="${String(graph.links.indexOf(link))}"]`);
                    if (otherPath) {
                        otherPath.setAttribute("stroke-opacity", "0.35");
                    }
                });
                this.interactions.hideTooltip(this.host, event);
            });
            append(nodeGroup, rect);

            const isRightSide = (node.x0 || 0) > size.width / 2;
            const label = svgEl(
                "text",
                {
                    x: isRightSide ? (node.x0 || 0) - 6 : (node.x1 || 0) + 6,
                    y: (node.y0 || 0) + height / 2 + 3,
                    fill: theme.fg,
                    "font-size": 10,
                    "text-anchor": isRightSide ? "end" : "start",
                    "pointer-events": "none"
                },
                `${node.name.length > 20 ? `${node.name.slice(0, 19)}…` : node.name} · ${formatCompact(node.value || 0, 1)}`
            );
            append(nodeGroup, label);
        });
        append(svg, nodeGroup);
        append(chrome.body, svg);

        const note = el("span", { class: "tl-note" }, "arraste os campos de Origem/Destino para comparar cenários · clique numa faixa para filtrar o relatório");
        note.style.fontSize = "10px";
        note.style.color = theme.sub;
        append(chrome.footer, note);
        void rgba;
    }

    /** Normalises both supported shapes (categorical groups and table rows) into flows. */
    private collectFlows(ctx: Ctx): { source: string; target: string; value: number; identity: powerbi.visuals.ISelectionId | null }[] {
        const flows: { source: string; target: string; value: number; identity: powerbi.visuals.ISelectionId | null }[] = [];
        const measure = ctx.firstSeries("measure") || ctx.series.filter((item) => item.values.some((value) => value !== null))[0] || null;

        if (ctx.groups.length > 1 && measure) {
            ctx.byCategory.forEach((entry, position) => {
                ctx.groups.forEach((group) => {
                    const series = group.series.find((item) => item.role === "measure") || group.series[0];
                    const value = series.values[entry.index];
                    if (value !== null && value > 0) {
                        flows.push({
                            source: entry.label,
                            target: group.name,
                            value,
                            identity: ctx.identities[entry.index]
                        });
                    }
                });
                void position;
            });
            return flows;
        }

        if (ctx.tableGroups.length > 1 && measure) {
            const source = ctx.tableGroups[0];
            const target = ctx.tableGroups[1];
            for (let index = 0; index < source.labels.length; index++) {
                const value = measure.values[index];
                if (value !== null && value > 0) {
                    flows.push({
                        source: source.labels[index],
                        target: target.labels[index],
                        value,
                        identity: ctx.identities[index]
                    });
                }
            }
            return flows;
        }

        // Fallback: first measure is the source, second is the target, third is the weight.
        const numeric = ctx.series.filter((item) => item.values.some((value) => value !== null));
        if (numeric.length >= 3 && ctx.cats.length) {
            const weight = numeric[numeric.length - 1];
            ctx.cats.forEach((label, index) => {
                void label;
                const from = String(numeric[0].values[index] ?? "");
                const to = String(numeric[1].values[index] ?? "");
                const value = weight.values[index];
                if (from && to && value !== null && value > 0) {
                    flows.push({ source: from, target: to, value, identity: ctx.identities[index] });
                }
            });
        }
        return flows;
    }
}
