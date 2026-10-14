/**
 * Query builder (terminal) — lê o dataView como se fosse um banco: mostra a
 * consulta com a cláusula WHERE viva, grade mono-espaçada e predicados
 * clicáveis que aplicam filtro real ao relatório.
 */

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import {
    bodySize,
    buildCtx,
    clamp,
    formatCompact,
    formatNumber,
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
import { append, el, styled } from "../../../shared/src/dom";

class SqlCard extends PresentationCard {
    name: string = "sqlFilter";
    displayName: string = "Query";

    rowHeight = new formattingSettings.NumUpDown({
        name: "rowHeight",
        displayName: "Altura da linha (px)",
        value: 22
    });

    typeQuery = new formattingSettings.ToggleSwitch({
        name: "typeQuery",
        displayName: "Animar a consulta",
        value: true
    });

    maxPredicates = new formattingSettings.NumUpDown({
        name: "maxPredicates",
        displayName: "Máximo de predicados",
        value: 6
    });

    slices = [
        this.theme,
        this.accent,
        this.accent2,
        this.decimals,
        this.showValues,
        this.showLegend,
        this.rowHeight,
        this.typeQuery,
        this.maxPredicates
    ];
}

class SqlSettings extends BaseSettings {
    sqlFilter = new SqlCard();
    cards = [this.presentation, this.sqlFilter];
}

export class Visual extends TalosVisual {
    private predicates: string[] = [];
    private typed = false;
    private typingTimer: number | null = null;

    protected settingsModel(): { new (): formattingSettings.Model } {
        return SqlSettings;
    }

    public destroy(): void {
        if (this.typingTimer !== null) {
            window.clearInterval(this.typingTimer);
            this.typingTimer = null;
        }
        super.destroy();
    }

    protected render(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        const settings = this.settings as SqlSettings;
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
            title: "Query builder",
            subtitle: "modo terminal"
        });

        if (!ctx.cats.length) {
            renderEmpty(chrome, "Adicione uma Categoria", "A consulta é montada a partir das colunas do visual");
            return;
        }

        const measureName = measure ? measure.name : "count(*)";
        const categoryName = categoryColumn ? String(categoryColumn.displayName) : "categoria";
        const entries = ctx.byCategory
            .map((entry) => ({
                label: entry.label,
                value: measure ? measure.values[entry.index] : null,
                identity: ctx.identities[entry.index],
                index: entry.index
            }))
            .filter((entry, position, list) => list.findIndex((item) => item.label === entry.label) === position);

        const total = sum(entries.map((entry) => entry.value || 0)) || 1;
        const maxValue = entries.reduce((best, entry) => Math.max(best, entry.value || 0), 0) || 1;
        const rowHeight = clamp(optNumber(settings.sqlFilter.rowHeight.value, 22), 14, 56);
        const maxPredicates = clamp(Math.round(optNumber(settings.sqlFilter.maxPredicates.value, 6)), 1, 20);
        const animate = optBool(settings.sqlFilter.typeQuery.value, true);
        const size = bodySize(chrome, ctx);

        const query = styled(
            "div",
            {
                "font-size": "11px",
                "line-height": "1.55",
                padding: "8px 10px",
                "border-radius": `${theme.radius}px`,
                "white-space": "pre",
                overflow: "hidden",
                "flex": "0 0 auto"
            },
            { class: "tl-query" }
        );
        query.style.backgroundColor = rgba(theme.card, 0.85);
        query.style.border = `1px solid ${theme.grid}`;

        const selectLine = el("div", { class: "tl-query-line" }, "");
        const fromLine = el("div", { class: "tl-query-line" }, "");
        const whereLine = styled("div", { display: "flex", "align-items": "center", gap: "6px", "flex-wrap": "wrap" }, { class: "tl-query-where" });
        selectLine.style.color = theme.fg;
        fromLine.style.color = theme.fg;

        const keyword = (text: string): HTMLElement => {
            const node = el("span", {}, text);
            node.style.color = theme.accent2;
            node.style.fontWeight = "700";
            return node;
        };
        const selectText = `${measureName},\n       count(*)`;
        const fromText = `${categoryName}`;
        const buildLine = (line: HTMLElement, keywordText: string, rest: string): void => {
            append(line, keyword(keywordText), el("span", {}, ` ${rest}`));
        };
        buildLine(selectLine, "SELECT", selectText);
        buildLine(fromLine, "FROM", `dataset  -- agrupado por ${fromText}`);
        append(query, selectLine, fromLine);

        const whereLabel = styled("div", { display: "flex", gap: "6px" }, { class: "tl-query-line" });
        append(whereLabel, keyword("WHERE"));
        append(whereLine, whereLabel);
        const predicateHost = styled("div", { display: "flex", gap: "4px", "flex-wrap": "wrap" }, { class: "tl-predicates" });
        append(whereLine, predicateHost);
        append(query, whereLine);

        const paintPredicates = (): void => {
            while (predicateHost.firstChild) {
                predicateHost.removeChild(predicateHost.firstChild);
            }
            if (!this.predicates.length) {
                const placeholder = el("span", {}, "1 = 1  -- sem filtro: clique numa linha da grade");
                placeholder.style.color = theme.sub;
                append(predicateHost, placeholder);
                return;
            }
            this.predicates.forEach((predicate) => {
                const chip = styled(
                    "span",
                    {
                        "font-size": "10px",
                        padding: "1px 7px",
                        "border-radius": "999px",
                        cursor: "pointer"
                    },
                    { class: "tl-predicate", title: "remover predicado" },
                    `${categoryName} = '${predicate}' ×`
                );
                chip.style.backgroundColor = rgba(theme.accent, 0.18);
                chip.style.color = theme.accent;
                chip.style.border = `1px solid ${rgba(theme.accent, 0.45)}`;
                chip.addEventListener("click", () => {
                    this.predicates = this.predicates.filter((item) => item !== predicate);
                    if (this.predicates.length) {
                        applyValueFilter(this.host, categoryColumn, this.predicates, "merge");
                    } else {
                        applyValueFilter(this.host, categoryColumn, [], "remove");
                    }
                    this.rerender();
                });
                append(predicateHost, chip);
            });
            if (this.predicates.length > 1) {
                const join = el("span", {}, "OR");
                join.style.color = theme.accent2;
                join.style.fontSize = "10px";
                append(predicateHost, join);
            }
        };
        paintPredicates();

        if (animate && !this.typed && typeof window !== "undefined") {
            this.typed = true;
            const fullSelect = selectLine.textContent || "";
            const fullFrom = fromLine.textContent || "";
            let index = 0;
            this.typingTimer = window.setInterval(() => {
                index += 3;
                selectLine.textContent = fullSelect.slice(0, index);
                if (index > fullSelect.length + 6) {
                    fromLine.textContent = fullFrom.slice(0, Math.max(0, index - fullSelect.length));
                }
                if (index > fullSelect.length + fullFrom.length + 6) {
                    selectLine.textContent = fullSelect;
                    fromLine.textContent = fullFrom;
                    if (this.typingTimer !== null) {
                        window.clearInterval(this.typingTimer);
                        this.typingTimer = null;
                    }
                }
            }, 16);
        }

        append(chrome.body, query);

        // A grade ocupa o que sobrar do bloco da consulta (medido de verdade,
        // não por um palpite de altura).
        const queryHeight = Math.max(72, Math.round(query.getBoundingClientRect().height) || 120);

        // result grid
        const grid = styled(
            "div",
            {
                "margin-top": "8px",
                display: "flex",
                "flex-direction": "column",
                overflow: "hidden",
                flex: "1 1 auto",
                "min-height": "0"
            },
            { class: "tl-grid" }
        );
        const gridSpace = Math.max(rowHeight, size.height - queryHeight - 34);
        const visibleRows = Math.max(1, Math.floor(gridSpace / rowHeight));
        const header = styled(
            "div",
            {
                display: "flex",
                gap: "8px",
                "font-size": "10px",
                "padding": "0 8px 4px",
                "text-transform": "uppercase",
                "letter-spacing": "0.04em",
                "flex": "0 0 auto"
            },
            { class: "tl-grid-header" }
        );
        header.style.color = theme.sub;
        header.style.borderBottom = `1px solid ${theme.grid}`;
        append(
            header,
            el("span", {}, "#"),
            styled("span", { flex: "1 1 auto" }, {}, categoryName),
            styled("span", { "min-width": "72px", "text-align": "right" }, {}, measureName),
            styled("span", { "min-width": "64px", "text-align": "right" }, {}, "share")
        );
        append(grid, header);

        entries.slice(0, visibleRows).forEach((entry, position) => {
            const isPredicate = this.predicates.indexOf(entry.label) >= 0;
            const row = styled(
                "div",
                {
                    display: "flex",
                    gap: "8px",
                    "align-items": "center",
                    height: `${rowHeight - 2}px`,
                    padding: "0 8px",
                    "font-size": "11px",
                    cursor: "pointer",
                    position: "relative",
                    overflow: "hidden",
                    "flex": "0 0 auto"
                },
                { class: "tl-grid-row" }
            );
            if (position % 2 === 1) {
                row.style.backgroundColor = rgba(theme.grid, 0.3);
            }
            const bar = styled("div", {
                position: "absolute",
                left: "0",
                top: "2px",
                bottom: "2px",
                width: `${clamp(((entry.value || 0) / maxValue) * 100, 0, 100)}%`,
                "border-radius": "2px",
                "z-index": "0"
            });
            bar.style.backgroundColor = isPredicate ? rgba(theme.accent, 0.24) : rgba(theme.sub, 0.12);
            append(row, bar);

            const rank = el("span", {}, String(position + 1).padStart(2, "0"));
            rank.style.color = theme.sub;
            rank.style.zIndex = "1";
            rank.style.fontVariantNumeric = "tabular-nums";
            const label = styled("span", { flex: "1 1 auto", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }, {}, entry.label);
            label.style.zIndex = "1";
            label.style.color = isPredicate ? theme.accent : theme.fg;
            label.style.fontWeight = isPredicate ? "700" : "400";
            const value = styled("span", { "min-width": "72px", "text-align": "right" }, {}, formatNumber(entry.value, { decimals }));
            value.style.zIndex = "1";
            value.style.color = theme.fg;
            value.style.fontVariantNumeric = "tabular-nums";
            const share = styled(
                "span",
                { "min-width": "64px", "text-align": "right" },
                {},
                `${(((entry.value || 0) / total) * 100).toFixed(1).replace(".", ",")}%`
            );
            share.style.zIndex = "1";
            share.style.color = theme.sub;

            append(row, rank, label, value, share);

            row.addEventListener("click", () => {
                const isActive = this.predicates.indexOf(entry.label) >= 0;
                if (isActive) {
                    this.predicates = this.predicates.filter((item) => item !== entry.label);
                } else if (this.predicates.length < maxPredicates) {
                    this.predicates = this.predicates.concat([entry.label]);
                }
                if (this.predicates.length) {
                    applyValueFilter(this.host, categoryColumn, this.predicates, "merge");
                } else {
                    applyValueFilter(this.host, categoryColumn, [], "remove");
                }
                this.rerender();
            });
            append(grid, row);
        });

        append(chrome.body, grid);

        const status = styled("span", { "font-size": "10px" }, {}, `rows: ${entries.length} · exibindo ${Math.min(entries.length, visibleRows)} · predicados: ${this.predicates.length}/${maxPredicates}`);
        status.style.color = this.predicates.length ? theme.accent : theme.sub;
        const hint = styled("span", { "font-size": "10px" }, {}, "clique numa linha para adicionar um predicado ao WHERE");
        hint.style.color = theme.sub;
        append(chrome.footer, status, hint);

        if (showValues) {
            chrome.subEl.textContent = `soma ${formatCompact(total, 1)}`;
        }
    }
}
