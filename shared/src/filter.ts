/**
 * Cross-filtering support: turns a data column + values into a Power BI basic
 * filter and hands it to the host, so clicking a visual filters the report.
 */

import powerbi from "powerbi-visuals-api";
import * as models from "powerbi-models";

import { Host, PrimitiveValue } from "./kit";

export function columnTarget(column: powerbi.DataViewMetadataColumn): { table: string; column: string } | null {
    const queryName = column && column.queryName ? String(column.queryName) : "";
    if (!queryName) {
        return null;
    }
    const parts = queryName.split(".");
    const columnName = parts.length > 1 ? parts.pop() as string : queryName;
    const table = parts.length ? parts[parts.length - 1] : (column.queryName ? String(column.queryName) : "");
    return { table: stripQuotes(table), column: stripQuotes(columnName) };
}

function stripQuotes(value: string): string {
    return value.replace(/^'/, "").replace(/'$/, "").replace(/^\[/, "").replace(/\]$/, "");
}

export function applyValueFilter(
    host: Host,
    column: powerbi.DataViewMetadataColumn | null,
    values: PrimitiveValue[],
    mode: "merge" | "remove"
): boolean {
    if (!column) {
        return false;
    }
    const target = columnTarget(column);
    if (!target) {
        return false;
    }
    const clean = values.filter((value) => value !== null && value !== undefined) as (string | number | boolean)[];
    if (mode === "merge" && !clean.length) {
        return false;
    }
    const filter = new models.BasicFilter(target, "In", clean);
    host.applyJsonFilter(filter, "general", "filter", mode === "merge" ? powerbi.FilterAction.merge : powerbi.FilterAction.remove);
    return true;
}

/** ADVANCED filter used by the SQL visual to express "In (a, b, c)" style predicates. */
export function applyAdvancedFilter(
    host: Host,
    column: powerbi.DataViewMetadataColumn | null,
    operator: "in" | "notIn",
    values: PrimitiveValue[]
): boolean {
    if (!column) {
        return false;
    }
    const target = columnTarget(column);
    if (!target) {
        return false;
    }
    const clean = values.filter((value) => value !== null && value !== undefined) as (string | number | boolean)[];
    const conditions = clean.map((value) => ({
        operator: operator === "in" ? "Is" : "IsNot",
        value
    }));
    if (!conditions.length) {
        return false;
    }
    const filter = new models.AdvancedFilter(target, "And", conditions as models.IAdvancedFilterCondition[]);
    host.applyJsonFilter(filter, "general", "filter", powerbi.FilterAction.merge);
    return true;
}
