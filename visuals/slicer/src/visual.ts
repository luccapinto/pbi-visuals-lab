/**
 * Filtro visual (formato lista) — ranking clicável que aplica filtro real ao
 * relatório: seleção múltipla, contadores por item, barra de participação e
 * botão de limpar. Puro DOM/HTML, sem SVG.
 */

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import {
    bodySize,
    buildCtx,
    clamp,
    colorForKey,
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
import { applyValueFilter } from "../../../shared/src/filter";
import { TalosVisual } from "../../../shared/src/base";
import { BaseSettings, PresentationCard, decimalsOf, resolvedTheme } from "../../../shared/src/settings";
import { append, clear, el, styled } from "../../../shared/src/dom";

class SlicerCard extends PresentationCard {
    name: string = "slicer";
    displayName: string = "Filtro";

    rowHeight = new formattingSettings.NumUpDown({
        name: "rowHeight",
        displayName: "Altura da linha (px)",
        value: 26
    });

    showBars = new formattingSettings.ToggleSwitch({
        name: "showBars",
        displayName: "Barra de participação",
        value: true
    });

    showRank = new formattingSettings.ToggleSwitch({
        name: "showRank",
        displayName: "Numeração",
        value: true
    });

    slices = [
        this.theme,
        this.accent,
        this.accent2,
        this.decimals,
        this.showValues,
        this.showLegend,
        this.rowHeight,
        this.showBars,
        this.showRank
    ];
}

class SlicerSettings extends BaseSettings {
    slicer = new SlicerCard();
    cards = [this.presentation, this.slicer];
}

export class Visual extends TalosVisual {
    private selectedValues: string[] = [];

    protected settingsModel(): { new (): formattingSettings.Model } {
        return SlicerSettings;
    }

    protected render(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        const settings = this.settings as SlicerSettings;
        const theme = resolvedTheme(settings);
        const ctx = buildCtx(options, this.host, theme);
        const decimals = decimalsOf(settings);
        const showValues = optBool(settings.presentation.showValues.value, true);

        const measure = ctx.firstSeries("measure") || ctx.series.filter((item) => item.values.some((value) => value !== null))[0] || null;
        const categoryColumn =
            ctx.categorical && ctx.categorical.categories && ctx.categorical.categories.length
                ? ctx.categorical.categories[0].source
                : ctx.table && ctx.table.columns.length
                  ? ctx.table.columns[0]
                  : null;

        const chrome = renderChrome(this.root, theme, {
            title: "Filtro",
            subtitle: categoryColumn ? String(categoryColumn.displayName) : ""
        });

        if (!ctx.cats.length || !categoryColumn) {
            renderEmpty(chrome, "Adicione uma Categoria", "Clique nos itens para filtrar o relatório inteiro");
            return;
        }

        const entries = ctx.byCategory
            .map((entry) => ({
                label: entry.label,
                value: measure ? measure.values[entry.index] : null,
                index: entry.index,
                identity: ctx.identities[entry.index]
            }))
            .filter((entry, position, list) => list.findIndex((item) => item.label === entry.label) === position);

        const byValue = measure ? entries.slice().sort((a, b) => (b.value || 0) - (a.value || 0)) : entries;
        const total = sum(entries.map((entry) => entry.value || 0)) || 1;
        const maxValue = byValue.reduce((best, entry) => Math.max(best, entry.value || 0), 0) || 1;
        const rowHeight = clamp(optNumber(settings.slicer.rowHeight.value, 26), 16, 64);
        const showBars = optBool(settings.slicer.showBars.value, true);
        const showRank = optBool(settings.slicer.showRank.value, true);
        const size = bodySize(chrome, ctx);
        const visibleRows = Math.max(1, Math.floor((size.height - 26) / rowHeight));

        const list = styled("div", { display: "flex", "flex-direction": "column", gap: "1px", overflow: "hidden" }, { class: "tl-slicer-list" });
        const active = new Set<string>(this.selectedValues);

        byValue.slice(0, visibleRows).forEach((entry, position) => {
            const isActive = active.has(entry.label);
            const row = styled(
                "div",
                {
                    display: "flex",
                    "align-items": "center",
                    gap: "8px",
                    height: `${rowHeight - 2}px`,
                    padding: "0 8px",
                    "border-radius": `${theme.radius}px`,
                    position: "relative",
                    cursor: "pointer",
                    overflow: "hidden"
                },
                { class: "tl-slicer-row", title: entry.label }
            ) as HTMLElement;
            row.style.backgroundColor = isActive ? rgba(theme.accent, 0.16) : "transparent";

            if (showBars && entry.value !== null) {
                const bar = styled("div", {
                    position: "absolute",
                    left: "0",
                    top: "2px",
                    bottom: "2px",
                    width: `${clamp(((entry.value || 0) / maxValue) * 100, 0, 100)}%`,
                    "border-radius": `${theme.radius}px`,
                    "z-index": "0"
                });
                bar.style.backgroundColor = isActive ? rgba(theme.accent, 0.22) : rgba(theme.sub, 0.14);
                append(row, bar);
            }

            if (showRank) {
                const rank = el("span", { class: "tl-slicer-rank" }, String(position + 1));
                rank.style.zIndex = "1";
                rank.style.minWidth = "18px";
                rank.style.color = isActive ? theme.accent : theme.sub;
                rank.style.fontSize = "10px";
                rank.style.fontWeight = "700";
                rank.style.fontVariantNumeric = "tabular-nums";
                append(row, rank);
            }

            const check = el("span", { class: "tl-slicer-check" }, isActive ? "✓" : "");
            check.style.zIndex = "1";
            check.style.width = "12px";
            check.style.color = theme.accent;
            check.style.fontSize = "11px";
            check.style.fontWeight = "700";
            append(row, check);

            const label = el("span", { class: "tl-slicer-label" }, entry.label);
            label.style.zIndex = "1";
            label.style.flex = "1 1 auto";
            label.style.color = isActive ? theme.fg : theme.fg;
            label.style.fontSize = "11px";
            label.style.fontWeight = isActive ? "700" : "400";
            label.style.whiteSpace = "nowrap";
            label.style.overflow = "hidden";
            label.style.textOverflow = "ellipsis";
            append(row, label);

            if (showValues && entry.value !== null) {
                const value = el("span", { class: "tl-slicer-value" });
                value.style.zIndex = "1";
                value.style.color = isActive ? theme.accent : theme.sub;
                value.style.fontSize = "10px";
                value.style.fontVariantNumeric = "tabular-nums";
                value.style.whiteSpace = "nowrap";
                value.textContent = `${formatCompact(entry.value, 1)} · ${(((entry.value || 0) / total) * 100).toFixed(0)}%`;
                append(row, value);
            }

            row.addEventListener("click", () => {
                if (active.has(entry.label)) {
                    active.delete(entry.label);
                } else {
                    active.add(entry.label);
                }
                this.selectedValues = Array.from(active);
                const values = this.selectedValues;
                if (!values.length) {
                    applyValueFilter(this.host, categoryColumn, [], "remove");
                } else {
                    applyValueFilter(this.host, categoryColumn, values, "merge");
                }
                this.rerender();
            });
            append(list, row);
        });

        append(chrome.body, list);

        const footer = el("div", { class: "tl-slicer-footer" });
        footer.style.display = "flex";
        footer.style.alignItems = "center";
        footer.style.gap = "8px";
        footer.style.width = "100%";

        const status = el("span", { class: "tl-slicer-status" });
        status.style.fontSize = "10px";
        status.style.color = this.selectedValues.length ? theme.accent : theme.sub;
        status.textContent = this.selectedValues.length
            ? `${this.selectedValues.length} de ${entries.length} selecionados · filtrando o relatório`
            : `${entries.length} itens · nada selecionado`;
        append(footer, status);

        if (this.selectedValues.length) {
            const clearButton = styled(
                "button",
                {
                    "margin-left": "auto",
                    "font-size": "10px",
                    padding: "3px 10px",
                    "border-radius": "999px",
                    cursor: "pointer",
                    "font-weight": "600"
                },
                { class: "tl-slicer-clear", type: "button" },
                "limpar"
            ) as HTMLButtonElement;
            clearButton.style.border = `1px solid ${rgba(theme.accent, 0.6)}`;
            clearButton.style.backgroundColor = "transparent";
            clearButton.style.color = theme.accent;
            clearButton.addEventListener("click", () => {
                this.selectedValues = [];
                applyValueFilter(this.host, categoryColumn, [], "remove");
                this.rerender();
            });
            append(footer, clearButton);
        }

        chrome.footer.style.paddingTop = "6px";
        append(chrome.footer, footer);

        const note = styled("span", { "font-size": "10px", color: theme.sub });
        note.textContent = categoryColumn ? `alvo do filtro: ${String(categoryColumn.displayName)}` : "";
        append(chrome.footer, note);
        void mixColors;
        void colorForKey;
        void formatNumber;
        void decimals;
        void clear;
    }
}
