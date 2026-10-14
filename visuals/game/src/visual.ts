/**
 * Desafio (bônus interativo) — jogo de adivinhação sobre o próprio dado:
 * a categoria aparece, o valor fica escondido e o jogador chuta. A pontuação
 * cresce conforme o acerto relativo, com sequência, recorde e rodadas.
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
    optNumber,
    renderChrome,
    renderEmpty,
    rgba,
    sum
} from "../../../shared/src/kit";
import { TalosVisual } from "../../../shared/src/base";
import { BaseSettings, PresentationCard, decimalsOf, resolvedTheme } from "../../../shared/src/settings";
import { append, clear, el, styled } from "../../../shared/src/dom";

class GameCard extends PresentationCard {
    name: string = "game";
    displayName: string = "Desafio";

    rounds = new formattingSettings.NumUpDown({
        name: "rounds",
        displayName: "Rodadas por partida",
        value: 8
    });

    tolerance = new formattingSettings.NumUpDown({
        name: "tolerance",
        displayName: "Tolerância para 100 pontos (%)",
        value: 10
    });

    slices = [
        this.theme,
        this.accent,
        this.accent2,
        this.decimals,
        this.showValues,
        this.showLegend,
        this.rounds,
        this.tolerance
    ];
}

class GameSettings extends BaseSettings {
    game = new GameCard();
    cards = [this.presentation, this.game];
}

/** Cryptographically sourced index (the visuals lint rule forbids Math.random). */
function secureIndex(bound: number): number {
    if (bound <= 1) {
        return 0;
    }
    const buffer = new Uint32Array(1);
    const crypto = window.crypto || (window as unknown as { msCrypto?: Crypto }).msCrypto;
    if (crypto && crypto.getRandomValues) {
        crypto.getRandomValues(buffer);
        return buffer[0] % bound;
    }
    return 0;
}

interface Round {
    label: string;
    value: number;
}

export class Visual extends TalosVisual {
    private queue: Round[] = [];
    private cursor = 0;
    private score = 0;
    private streak = 0;
    private best = 0;
    private lastResult: string = "";
    private finished = false;

    protected settingsModel(): { new (): formattingSettings.Model } {
        return GameSettings;
    }

    protected render(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        const settings = this.settings as GameSettings;
        const theme = resolvedTheme(settings);
        const ctx = buildCtx(options, this.host, theme);
        const decimals = decimalsOf(settings);
        const measure = ctx.firstSeries("measure") || ctx.series.filter((item) => item.values.some((value) => value !== null))[0] || null;

        const chrome = renderChrome(this.root, theme, {
            title: "Desafio · quem conhece os números?",
            subtitle: measure ? `chute o valor de ${measure.name}` : ""
        });

        if (ctx.isEmpty || !measure) {
            renderEmpty(chrome, "Adicione Categoria e um Valor", "O jogo sorteia uma categoria e você tenta acertar o valor");
            return;
        }

        const rounds = clamp(Math.round(optNumber(settings.game.rounds.value, 8)), 3, 20);
        const tolerance = clamp(optNumber(settings.game.tolerance.value, 10), 1, 50);
        const candidates = ctx.byCategory
            .map((entry) => ({ label: entry.label, value: measure.values[entry.index] }))
            .filter((entry) => entry.value !== null && entry.value > 0) as Round[];

        if (candidates.length < 3) {
            renderEmpty(chrome, "Poucas categorias para jogar", "São necessárias pelo menos 3 categorias com valor positivo");
            return;
        }

        if (this.queue.length !== Math.min(rounds, candidates.length) || this.queue.some((round) => !candidates.some((item) => item.label === round.label))) {
            this.startGame(candidates, rounds);
        }

        const size = bodySize(chrome, ctx);
        const current = this.queue[this.cursor] || null;

        const board = styled(
            "div",
            {
                display: "flex",
                "flex-direction": "column",
                gap: "10px",
                height: "100%",
                "box-sizing": "border-box",
                padding: "4px 0"
            },
            { class: "tl-game" }
        );

        // scoreboard
        const scoreboard = styled("div", { display: "flex", gap: "14px", "align-items": "baseline", "flex-wrap": "wrap" }, { class: "tl-game-score" });
        const bigScore = styled("div", {}, {}, String(this.score));
        bigScore.style.fontSize = `${clamp(size.width * 0.09, 22, 46)}px`;
        bigScore.style.fontWeight = "800";
        bigScore.style.color = theme.accent;
        bigScore.style.lineHeight = "1";
        append(scoreboard, bigScore);
        const scoreLabel = styled("div", {}, {}, `pontos · sequência ${this.streak} · recorde ${this.best}`);
        scoreLabel.style.fontSize = "11px";
        scoreLabel.style.color = theme.sub;
        append(scoreboard, scoreLabel);
        const roundLabel = styled("div", { "margin-left": "auto" }, {}, `rodada ${Math.min(this.cursor + 1, this.queue.length)}/${this.queue.length}`);
        roundLabel.style.fontSize = "11px";
        roundLabel.style.color = theme.sub;
        append(scoreboard, roundLabel);
        append(board, scoreboard);

        if (!current) {
            const done = styled("div", { display: "flex", "flex-direction": "column", gap: "8px", "align-items": "flex-start" }, { class: "tl-game-done" });
            const verdict = el("div", {}, `Fim de jogo: ${this.score} pontos (recorde ${this.best})`);
            verdict.style.fontSize = "13px";
            verdict.style.fontWeight = "700";
            verdict.style.color = theme.fg;
            const bar = this.progressBar(theme, this.score / (this.queue.length * 100), size.width);
            const again = styled(
                "button",
                { padding: "6px 14px", "border-radius": "999px", cursor: "pointer", "font-size": "11px", "font-weight": "700" },
                { class: "tl-game-again", type: "button" },
                "jogar de novo"
            ) as HTMLButtonElement;
            again.style.backgroundColor = theme.accent;
            again.style.color = theme.bg;
            again.style.border = "none";
            again.addEventListener("click", () => {
                this.startGame(candidates, rounds);
                this.rerender();
            });
            append(done, verdict, bar, again);
            append(board, done);
            append(chrome.body, board);
            return;
        }

        const card = styled(
            "div",
            {
                display: "flex",
                "flex-direction": "column",
                gap: "10px",
                padding: "12px",
                "border-radius": `${theme.radius + 2}px`,
                flex: "1 1 auto",
                "justify-content": "center"
            },
            { class: "tl-game-card" }
        );
        card.style.backgroundColor = rgba(theme.card, 0.8);
        card.style.border = `1px solid ${theme.grid}`;

        const label = styled("div", {}, {}, current.label);
        label.style.fontSize = `${clamp(size.width * 0.045, 14, 26)}px`;
        label.style.fontWeight = "700";
        label.style.color = theme.fg;
        append(card, label);

        const hint = styled("div", {}, {}, `quanto vale ${measure.name} para essa categoria?`);
        hint.style.fontSize = "11px";
        hint.style.color = theme.sub;
        append(card, hint);

        const answers = styled("div", { display: "flex", gap: "8px", "align-items": "center", "flex-wrap": "wrap" }, { class: "tl-game-answers" });
        const input = styled(
            "input",
            {
                flex: "1 1 120px",
                "min-width": "90px",
                "max-width": "220px",
                padding: "7px 10px",
                "font-size": "14px",
                "border-radius": `${theme.radius}px`,
                outline: "none"
            },
            { class: "tl-game-input", type: "text", inputmode: "decimal", placeholder: "seu chute", "aria-label": "seu chute" }
        ) as HTMLInputElement;
        input.style.backgroundColor = rgba(theme.bg, 0.7);
        input.style.color = theme.fg;
        input.style.border = `1px solid ${theme.grid}`;

        const submit = styled(
            "button",
            { padding: "7px 14px", "border-radius": `${theme.radius}px`, cursor: "pointer", "font-size": "12px", "font-weight": "700" },
            { class: "tl-game-submit", type: "button" },
            "chutar"
        ) as HTMLButtonElement;
        submit.style.backgroundColor = theme.accent;
        submit.style.color = theme.bg;
        submit.style.border = "none";

        const reveal = styled("div", {}, {}, this.lastResult);
        reveal.style.fontSize = "11px";
        reveal.style.color = this.lastResult.indexOf("acertou") >= 0 ? theme.accent2 : theme.sub;
        append(answers, input, submit);
        append(card, answers, reveal);
        append(board, card);

        const play = (): void => {
            const guess = parseGuess(input.value);
            if (guess === null || this.finished) {
                return;
            }
            const actual = current.value;
            const error = Math.abs(guess - actual) / actual;
            const points = Math.max(0, Math.round(100 * Math.max(0, 1 - error / (tolerance / 100))));
            this.score += points;
            this.best = Math.max(this.best, this.score);
            if (points > 0) {
                this.streak += 1;
            } else {
                this.streak = 0;
            }
            const exact = error <= 0.01;
            this.lastResult = exact
                ? `acertou na mosca: ${formatNumber(actual, { decimals })} (+${points} pontos)`
                : `real: ${formatNumber(actual, { decimals })} · você chutou ${formatNumber(guess, { decimals })} (${(error * 100).toFixed(1).replace(".", ",")}% de erro) · +${points} pontos`;
            this.cursor += 1;
            if (this.cursor >= this.queue.length) {
                this.finished = true;
            }
            this.rerender();
        };

        submit.addEventListener("click", play);
        input.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter") {
                play();
            }
        });

        append(chrome.body, board);

        const bar = this.progressBar(theme, this.cursor / this.queue.length, size.width);
        const footerNote = styled("span", { "font-size": "10px" }, {}, `tolerância de ${tolerance}% para pontuação cheia · pontuação por acerto relativo`);
        footerNote.style.color = theme.sub;
        append(chrome.footer, bar, footerNote);
        void colorForKey;
        void mixColors;
        void sum;
        void clear;
        void formatCompact;
    }

    private startGame(candidates: Round[], rounds: number): void {
        const pool = candidates.slice();
        const picked: Round[] = [];
        const target = Math.min(rounds, pool.length);
        for (let index = 0; index < target; index++) {
            const position = secureIndex(pool.length);
            picked.push(pool[position]);
            pool.splice(position, 1);
        }
        this.queue = picked;
        this.cursor = 0;
        this.score = 0;
        this.streak = 0;
        this.lastResult = "";
        this.finished = false;
    }

    private progressBar(theme: { accent: string; grid: string; radius: number }, ratio: number, width: number) {
        const track = styled("div", { width: `${Math.max(60, width)}px`, height: "4px", "border-radius": "999px", overflow: "hidden" });
        track.style.backgroundColor = rgba(theme.grid, 0.8);
        const fill = styled("div", { width: `${clamp(ratio, 0, 1) * 100}%`, height: "100%" });
        fill.style.backgroundColor = theme.accent;
        append(track, fill);
        return track;
    }
}

function parseGuess(raw: string): number | null {
    const text = String(raw || "").trim().replace(/\s/g, "");
    if (!text) {
        return null;
    }
    const normalized = text.indexOf(",") >= 0 ? text.replace(/\./g, "").replace(",", ".") : text;
    const value = Number(normalized);
    return isFinite(value) ? value : null;
}
