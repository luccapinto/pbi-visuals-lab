/**
 * Base class wiring the Power BI visual lifecycle: formatting pane, render events,
 * selection re-render and error reporting. Each visual implements render().
 */

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService, formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import { Host, Interactions } from "./kit";

export abstract class TalosVisual implements powerbi.extensibility.visual.IVisual {
    protected host: Host;
    protected root: HTMLElement;
    protected events: powerbi.extensibility.IVisualEventService;
    protected formattingService: FormattingSettingsService;
    protected settings: formattingSettings.Model;
    protected interactions: Interactions;
    private lastOptions: powerbi.extensibility.visual.VisualUpdateOptions | null = null;
    private destroyed = false;

    constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
        this.host = options.host;
        this.root = options.element;
        this.events = options.host.eventService;
        this.formattingService = new FormattingSettingsService();
        this.interactions = new Interactions(this.host);
        this.interactions.onChange(() => this.rerender());
    }

    /** Formatting model class of the concrete visual. */
    protected abstract settingsModel(): { new (): formattingSettings.Model };
    /** Draws the visual for the given update options. */
    protected abstract render(options: powerbi.extensibility.visual.VisualUpdateOptions): void;

    public update(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        if (this.destroyed) {
            return;
        }
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews.length ? options.dataViews[0] : undefined;
            this.settings = this.formattingService.populateFormattingSettingsModel(this.settingsModel(), dataView);
            this.lastOptions = options;
            this.render(options);
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, error instanceof Error ? error.message : String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingService.buildFormattingModel(this.settings);
    }

    public destroy(): void {
        this.destroyed = true;
        this.lastOptions = null;
    }

    protected rerender(): void {
        if (!this.lastOptions || this.destroyed) {
            return;
        }
        try {
            this.render(this.lastOptions);
        } catch (error) {
            this.events.renderingFailed(this.lastOptions, error instanceof Error ? error.message : String(error));
        }
    }
}

/** Shifts a colour toward the theme surface, used for "muted" states. */
export function lerpColor(from: string, to: string, t: number): string {
    const parse = (hex: string) => {
        const text = hex.replace("#", "");
        const value = parseInt(text.length === 3 ? text[0] + text[0] + text[1] + text[1] + text[2] + text[2] : text, 16);
        return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
    };
    const a = parse(from);
    const b = parse(to);
    const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
    return `rgb(${mix(a.r, b.r)},${mix(a.g, b.g)},${mix(a.b, b.b)})`;
}
