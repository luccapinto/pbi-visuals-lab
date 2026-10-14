// Tiny DOM/SVG helpers. All text goes through textContent (no innerHTML anywhere).

export type Attrs = Record<string, string | number | boolean | undefined | null>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    applyAttrs(node, attrs);
    if (text !== undefined && text !== null) {
        node.textContent = String(text);
    }
    return node;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs?: Attrs,
    text?: string
): SVGElementTagNameMap[K] {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    applyAttrs(node, attrs);
    if (text !== undefined && text !== null) {
        node.textContent = String(text);
    }
    return node;
}

export function applyAttrs(node: Element, attrs?: Attrs): void {
    if (!attrs) {
        return;
    }
    for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (value === undefined || value === null || value === false) {
            continue;
        }
        if (value === true) {
            node.setAttribute(key, "");
        } else {
            node.setAttribute(key, String(value));
        }
    }
}

export function clear(node: Element): void {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

export function append<T extends Element>(parent: Element, ...children: (Element | null | undefined)[]): T & Element {
    for (const child of children) {
        if (child) {
            parent.appendChild(child);
        }
    }
    return parent as T & Element;
}

/** Element with inline styles applied from a record. */
export function styled<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    styles: Record<string, string>,
    attrs?: Attrs,
    text?: string
): HTMLElementTagNameMap[K] {
    const node = el(tag, attrs, text);
    for (const key of Object.keys(styles)) {
        node.style.setProperty(key, styles[key]);
    }
    return node;
}

export function svgRoot(width: number, height: number): SVGSVGElement {
    const root = svgEl("svg", {
        width,
        height,
        viewBox: `0 0 ${width} ${height}`,
        preserveAspectRatio: "xMidYMid meet",
        class: "talos-svg"
    });
    root.style.width = "100%";
    root.style.height = "100%";
    root.style.display = "block";
    return root;
}
