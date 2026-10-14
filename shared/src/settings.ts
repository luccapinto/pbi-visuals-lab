/** Formatting pane model shared by every visual in the pack. */

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import { THEMES, Theme, themeByKey, optColor, optText, optNumber, optBool } from "./kit";

export class PresentationCard extends formattingSettings.SimpleCard {
    name: string = "presentation";
    displayName: string = "Apresentação";

    theme = new formattingSettings.ItemDropdown({
        name: "theme",
        displayName: "Tema",
        items: THEMES.map((item) => ({ value: item.key, displayName: item.name })),
        value: { value: THEMES[0].key, displayName: THEMES[0].name }
    });

    accent = new formattingSettings.ColorPicker({
        name: "accent",
        displayName: "Cor de destaque",
        value: { value: "" }
    });

    accent2 = new formattingSettings.ColorPicker({
        name: "accent2",
        displayName: "Cor secundária",
        value: { value: "" }
    });

    decimals = new formattingSettings.NumUpDown({
        name: "decimals",
        displayName: "Casas decimais",
        value: 2
    });

    showValues = new formattingSettings.ToggleSwitch({
        name: "showValues",
        displayName: "Mostrar valores",
        value: true
    });

    showLegend = new formattingSettings.ToggleSwitch({
        name: "showLegend",
        displayName: "Mostrar legenda",
        value: true
    });

    slices = [this.theme, this.accent, this.accent2, this.decimals, this.showValues, this.showLegend];
}

export class BaseSettings extends formattingSettings.Model {
    presentation = new PresentationCard();
    cards = [this.presentation];
}

/** Reads back the resolved theme (preset + colour overrides) from the formatting model. */
export function resolvedTheme(settings: BaseSettings): Theme {
    const key = optText(settings.presentation.theme.value, THEMES[0].key);
    const base = themeByKey(typeof key === "string" ? key : THEMES[0].key);
    return {
        key: base.key,
        name: base.name,
        bg: base.bg,
        card: base.card,
        fg: base.fg,
        sub: base.sub,
        grid: base.grid,
        accent: optColor(settings.presentation.accent.value, base.accent),
        accent2: optColor(settings.presentation.accent2.value, base.accent2),
        palette: [optColor(settings.presentation.accent.value, base.palette[0]), base.palette[1], base.palette[2], base.palette[3], base.palette[4], base.palette[5], base.palette[6], base.palette[7]],
        mono: base.mono,
        radius: base.radius
    };
}

export function decimalsOf(settings: BaseSettings): number {
    return Math.round(optNumber(settings.presentation.decimals.value, 2));
}

export function showValuesOf(settings: BaseSettings): boolean {
    return optBool(settings.presentation.showValues.value, true);
}

export function showLegendOf(settings: BaseSettings): boolean {
    return optBool(settings.presentation.showLegend.value, true);
}

export function perVisualCard(cardName: string, displayName: string, slices: formattingSettings.Slice[]): formattingSettings.SimpleCard {
    const card = new formattingSettings.SimpleCard();
    card.name = cardName;
    card.displayName = displayName;
    card.slices = slices;
    return card;
}
