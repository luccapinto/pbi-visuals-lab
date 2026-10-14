/**
 * Página de demonstração da pack de visuais do Talos.
 *
 * Cada cartão hospeda uma instância REAL do pacote .pbiviz compilado, rodando
 * contra um host falso que implementa o contrato do Power BI: seleção,
 * tooltips, persistProperties e applyJsonFilter. Filtro aplicado num cartão
 * vale para todos os outros, do mesmo jeito que no relatório de verdade.
 *
 * Os dados são sintéticos e determinísticos (nenhum dado real de ninguém).
 */
(function () {
    "use strict";

    var MANIFEST = window.TALOS_VISUALS || [];
    var CATEGORIES = [
        "São Paulo",
        "Rio de Janeiro",
        "Minas Gerais",
        "Paraná",
        "Bahia",
        "Santa Catarina",
        "Pernambuco",
        "Rio Grande do Sul",
        "Ceará",
        "Goiás",
        "Pará",
        "Amazonas"
    ];
    var GROUPS = ["Varejo", "Atacado", "Digital"];
    var THEME_KEYS = ["xp", "papel", "neon", "terminal"];

    var state = {
        theme: "xp",
        showValues: true,
        filter: null,
        objects: {},
        demos: [],
        failures: 0
    };

    /* ------------------------------------------------------------- dados */

    function valueFor(role, categoryIndex, measureIndex, groupIndex) {
        var base = 1;
        if (role === "measure") {
            base = 1450;
        } else if (role === "measure2") {
            base = 980;
        } else if (role === "measure3") {
            base = 320;
        } else if (role === "start") {
            base = 1200;
        } else if (role === "end") {
            base = 1750;
        }
        var growth = 1.26 + measureIndex * 0.08;
        var value = Math.round(base * Math.pow(categoryIndex + 1, growth));
        if (role === "start") {
            value = Math.round(value * (0.82 + (categoryIndex % 3) * 0.06));
        }
        if (role === "end") {
            value = Math.round(value * (1.02 + (categoryIndex % 4) * 0.05));
        }
        if (typeof groupIndex === "number") {
            value = Math.round(value * (groupIndex === 0 ? 1 : groupIndex === 1 ? 0.54 : 0.33));
        }
        return value;
    }

    function visibleCategories() {
        if (!state.filter || !state.filter.values.length) {
            return CATEGORIES.slice();
        }
        var allowed = CATEGORIES.filter(function (category) {
            return state.filter.values.indexOf(category) >= 0;
        });
        return allowed.length ? allowed : CATEGORIES.slice();
    }

    function buildDataView(spec) {
        var categories = visibleCategories();
        var metadata = { columns: [] };
        var objects = {};

        if (state.objects[spec.slug]) {
            objects = state.objects[spec.slug];
        }
        var viewObjects = {
            presentation: Object.assign(
                {
                    theme: state.theme,
                    showValues: state.showValues
                },
                objects.presentation || {}
            ),
            general: { filter: null }
        };
        if (spec.card && spec.card.name && objects[spec.card.name]) {
            viewObjects[spec.card.name] = objects[spec.card.name];
        }

        var metadataOut = { columns: metadata.columns, objects: viewObjects };

        if (spec.mapping === "grouped") {
            var values = [];
            GROUPS.forEach(function (group, groupIndex) {
                spec.measures.forEach(function (measure, measureIndex) {
                    values.push({
                        source: {
                            displayName: measure.name,
                            queryName: "Vendas." + measure.role + "." + group,
                            roles: keyed(measure.role),
                            format: measure.format,
                            groupName: group
                        },
                        values: categories.map(function (_unused, index) {
                            return valueFor(measure.role, CATEGORIES.indexOf(_unused), measureIndex, groupIndex);
                        }),
                        groupName: group
                    });
                });
            });
            return {
                metadata: metadataOut,
                categorical: {
                    categories: [
                        {
                            source: { displayName: "Estado", queryName: "Vendas.Estado", roles: keyed(spec.categoryRoles[0]) },
                            values: categories,
                            identity: categories.map(function () {
                                return {};
                            })
                        }
                    ],
                    values: values
                }
            };
        }

        if (spec.mapping === "table") {
            var columns = [
                { displayName: "Estado", queryName: "Vendas.Estado", roles: keyed("category"), index: 0 },
                { displayName: "Canal", queryName: "Vendas.Canal", roles: keyed("column"), index: 1 },
                {
                    displayName: "Receita",
                    queryName: "Vendas.measure",
                    roles: keyed("measure"),
                    isMeasure: true,
                    format: "R$ #,##0.00",
                    index: 2
                }
            ];
            var rows = [];
            var identities = [];
            categories.forEach(function (category) {
                GROUPS.forEach(function (_group, groupIndex) {
                    rows.push([category, GROUPS[groupIndex], valueFor("measure", CATEGORIES.indexOf(category), 0, groupIndex)]);
                    identities.push({});
                });
            });
            return { metadata: metadataOut, table: { columns: columns, rows: rows, identity: identities } };
        }

        var categoryColumn = {
            source: { displayName: "Estado", queryName: "Vendas.Estado", roles: keyed(spec.categoryRoles[0]) },
            values: categories,
            identity: categories.map(function () {
                return {};
            })
        };
        return {
            metadata: metadataOut,
            categorical: {
                categories: [categoryColumn],
                values: spec.measures.map(function (measure, measureIndex) {
                    return {
                        source: {
                            displayName: measure.name,
                            queryName: "Vendas." + measure.role,
                            roles: keyed(measure.role),
                            format: measure.format
                        },
                        values: categories.map(function (category) {
                            return valueFor(measure.role, CATEGORIES.indexOf(category), measureIndex);
                        })
                    };
                })
            }
        };
    }

    function keyed(role) {
        var result = {};
        result[role] = true;
        return result;
    }

    /* ------------------------------------------------------------- host */

    function makeHost(spec) {
        var selectionCallbacks = [];
        var selected = [];
        var idCounter = 0;

        function makeId(key) {
            return {
                getKey: function () {
                    return key;
                },
                equals: function (other) {
                    return !!other && other.getKey && other.getKey() === key;
                },
                includes: function () {
                    return false;
                },
                getSelector: function () {
                    return {};
                },
                getSelectorsByColumn: function () {
                    return {};
                },
                hasIdentity: function () {
                    return true;
                }
            };
        }

        var selectionManager = {
            select: function (ids, multiSelect) {
                var list = Array.isArray(ids) ? ids : [ids];
                if (multiSelect) {
                    list.forEach(function (id) {
                        var key = id.getKey();
                        var position = selected.map(function (item) {
                            return item.getKey();
                        }).indexOf(key);
                        if (position >= 0) {
                            selected.splice(position, 1);
                        } else {
                            selected.push(id);
                        }
                    });
                } else {
                    selected = list.slice();
                }
                selectionCallbacks.forEach(function (callback) {
                    callback(selected.slice());
                });
                return Promise.resolve(selected.slice());
            },
            clear: function () {
                selected = [];
                selectionCallbacks.forEach(function (callback) {
                    callback([]);
                });
                return Promise.resolve({});
            },
            showContextMenu: function () {
                return Promise.resolve({});
            },
            hasSelection: function () {
                return selected.length > 0;
            },
            getSelectionIds: function () {
                return selected.slice();
            },
            registerOnSelectCallback: function (callback) {
                selectionCallbacks.push(callback);
            }
        };

        var host = {
            instanceId: "demo-" + spec.slug,
            locale: "pt-BR",
            hostEnv: { isDeveloperMode: false },
            hostCapabilities: {},
            colorPalette: {
                getColor: function () {
                    return { value: "#4C8DFF" };
                },
                reset: function () {}
            },
            createSelectionManager: function () {
                return selectionManager;
            },
            createSelectionIdBuilder: function () {
                return {
                    withCategory: function () {
                        return this;
                    },
                    withSeries: function () {
                        return this;
                    },
                    withMeasure: function () {
                        return this;
                    },
                    withMatrixNode: function () {
                        return this;
                    },
                    withTable: function () {
                        return this;
                    },
                    createSelectionId: function () {
                        idCounter += 1;
                        return makeId("sel-" + spec.slug + "-" + idCounter);
                    }
                };
            },
            applyJsonFilter: function (filter, objectName, propertyName, action) {
                applyFilter(filter, action);
            },
            tooltipService: {
                enabled: function () {
                    return true;
                },
                show: function (options) {
                    showTooltip(options);
                },
                move: function (options) {
                    moveTooltip(options);
                },
                hide: function () {
                    hideTooltip();
                }
            },
            eventService: {
                renderingStarted: function () {},
                renderingFinished: function () {
                    var badge = document.querySelector('[data-error="' + spec.slug + '"]');
                    if (badge) {
                        badge.remove();
                    }
                },
                renderingFailed: function (options, error) {
                    state.failures += 1;
                    showError(spec, error);
                }
            },
            persistProperties: function (changes) {
                if (!state.objects[spec.slug]) {
                    state.objects[spec.slug] = {};
                }
                Object.keys(changes || {}).forEach(function (objectName) {
                    var container = changes[objectName];
                    if (!container || !container.properties) {
                        return;
                    }
                    var target = state.objects[spec.slug][objectName] || {};
                    Object.keys(container.properties).forEach(function (propertyName) {
                        target[propertyName] = container.properties[propertyName];
                    });
                    state.objects[spec.slug][objectName] = target;
                });
            },
            refreshHostData: function () {},
            telemetry: {
                instanceId: "demo-" + spec.slug,
                trace: function () {}
            },
            downloadService: {},
            launchUrl: function () {},
            displayWarningIcon: function () {},
            switchFocusModeState: function () {},
            fetchMoreData: function () {
                return false;
            },
            openModalDialog: function () {
                return Promise.resolve({});
            },
            createLocalizationManager: function () {
                return { getDisplayName: function (key) { return key; } };
            }
        };
        return host;
    }

    /* ------------------------------------------------- filtro e tooltip */

    function applyFilter(filter, action) {
        var remove = action === 1;
        if (remove) {
            state.filter = null;
        } else if (filter && filter.values && filter.values.length) {
            state.filter = { column: "Estado", values: filter.values.slice() };
        } else {
            state.filter = null;
        }
        paintFilterBanner();
        renderAll();
    }

    function paintFilterBanner() {
        var banner = document.getElementById("filter-banner");
        if (!banner) {
            return;
        }
        if (!state.filter) {
            banner.hidden = true;
            banner.textContent = "";
            return;
        }
        banner.hidden = false;
        banner.textContent = "";
        var text = document.createElement("span");
        text.textContent = "Filtro ativo · Estado ∈ {" + state.filter.values.join(", ") + "}";
        var action = document.createElement("button");
        action.type = "button";
        action.textContent = "limpar";
        action.addEventListener("click", function () {
            state.filter = null;
            paintFilterBanner();
            renderAll();
        });
        banner.appendChild(text);
        banner.appendChild(action);
    }

    function tooltipRoot() {
        var node = document.getElementById("talos-tooltip");
        if (!node) {
            node = document.createElement("div");
            node.id = "talos-tooltip";
            node.hidden = true;
            document.body.appendChild(node);
        }
        return node;
    }

    function showTooltip(options) {
        var node = tooltipRoot();
        node.textContent = "";
        (options.dataItems || []).forEach(function (item) {
            var row = document.createElement("div");
            row.className = "tt-row";
            var name = document.createElement("span");
            name.className = "tt-name";
            name.textContent = item.displayName;
            var value = document.createElement("span");
            value.className = "tt-value";
            value.textContent = item.value;
            row.appendChild(name);
            row.appendChild(value);
            node.appendChild(row);
        });
        node.hidden = !(options.dataItems || []).length;
        moveTooltip(options);
    }

    function moveTooltip(options) {
        var node = tooltipRoot();
        var coordinates = options.coordinates || [0, 0];
        node.style.left = coordinates[0] + 14 + "px";
        node.style.top = coordinates[1] + 14 + "px";
    }

    function hideTooltip() {
        var node = document.getElementById("talos-tooltip");
        if (node) {
            node.hidden = true;
        }
    }

    function showError(spec, error) {
        var mount = document.querySelector('[data-visual="' + spec.slug + '"]');
        if (!mount) {
            return;
        }
        var banner = document.createElement("div");
        banner.setAttribute("data-error", spec.slug);
        banner.className = "demo-error";
        banner.textContent = "Falha ao renderizar: " + (error || "erro desconhecido");
        mount.appendChild(banner);
    }

    /* ---------------------------------------------------------- montagem */

    function renderAll() {
        state.demos.forEach(function (demo) {
            renderOnce(demo);
        });
        updateHeroCounters();
    }

    function renderOnce(demo) {
        var spec = demo.spec;
        var plugin = window.powerbi && window.powerbi.visuals && window.powerbi.visuals.plugins[spec.guid];
        if (!plugin) {
            showError(spec, "pacote não carregado");
            return;
        }
        if (!demo.visual) {
            try {
                demo.visual = plugin.create({ element: demo.mount, host: demo.host });
            } catch (error) {
                showError(spec, error.message || String(error));
                return;
            }
        }
        var width = Math.max(240, Math.floor(demo.mount.clientWidth));
        var height = Math.max(180, Math.floor(demo.mount.clientHeight));
        try {
            demo.visual.update({
                viewport: { width: width, height: height },
                dataViews: [buildDataView(spec)],
                type: 2,
                viewMode: 0
            });
        } catch (error) {
            showError(spec, error.message || String(error));
        }
    }

    function updateHeroCounters() {
        var rows = visibleCategories().length;
        var nodes = document.getElementById("counter-rows");
        if (nodes) {
            nodes.textContent = String(rows);
        }
        var node = document.getElementById("counter-failures");
        if (node) {
            node.textContent = String(state.failures);
        }
    }

    function isDark(themeKey) {
        return themeKey !== "papel";
    }

    function applyThemeToPage() {
        var dark = isDark(state.theme);
        document.documentElement.setAttribute("data-theme", state.theme);
        document.body.classList.toggle("theme-dark", dark);
        document.body.classList.toggle("theme-light", !dark);
    }

    function initThemeControls() {
        var host = document.getElementById("theme-switch");
        if (!host) {
            return;
        }
        THEME_KEYS.forEach(function (key) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "seg-btn";
            button.setAttribute("data-theme-key", key);
            button.textContent = { xp: "Executivo", papel: "Papel", neon: "Neon", terminal: "Terminal" }[key];
            if (key === state.theme) {
                button.classList.add("is-active");
            }
            button.addEventListener("click", function () {
                state.theme = key;
                Array.prototype.forEach.call(host.querySelectorAll(".seg-btn"), function (other) {
                    other.classList.toggle("is-active", other.getAttribute("data-theme-key") === key);
                });
                applyThemeToPage();
                renderAll();
            });
            host.appendChild(button);
        });

        var valuesToggle = document.getElementById("values-toggle");
        if (valuesToggle) {
            valuesToggle.addEventListener("change", function () {
                state.showValues = valuesToggle.checked;
                renderAll();
            });
        }
    }

    function initReveal() {
        var observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
        );
        Array.prototype.forEach.call(document.querySelectorAll(".reveal"), function (node) {
            observer.observe(node);
        });
    }

    function initDemos() {
        MANIFEST.forEach(function (spec) {
            var mount = document.querySelector('[data-visual="' + spec.slug + '"]');
            if (!mount) {
                return;
            }
            mount.addEventListener("click", function (event) {
                if (event.target === mount) {
                    var plugin = window.powerbi.visuals.plugins[spec.guid];
                    if (plugin) {
                        var demo = state.demos.filter(function (item) {
                            return item.spec.guid === spec.guid;
                        })[0];
                        if (demo && demo.visual && demo.visual.interactions) {
                            demo.visual.interactions.clear();
                        }
                    }
                }
            });
            state.demos.push({ spec: spec, mount: mount, host: makeHost(spec), visual: null });
        });
        renderAll();
    }

    function initResize() {
        var timer = null;
        window.addEventListener("resize", function () {
            if (timer) {
                window.clearTimeout(timer);
            }
            timer = window.setTimeout(function () {
                hideTooltip();
                renderAll();
            }, 180);
        });
    }

    function initCounterList() {
        var host = document.getElementById("visual-count");
        if (host) {
            host.textContent = String(MANIFEST.length);
        }
        var bytes = MANIFEST.reduce(function (total, spec) {
            return total + (spec.bytes || 0);
        }, 0);
        var sizeHost = document.getElementById("pack-size");
        if (sizeHost) {
            sizeHost.textContent = (bytes / 1024).toFixed(0) + " KB";
        }
        var verified = MANIFEST.filter(function (spec) {
            return spec.verify && spec.verify.ok;
        }).length;
        var verifiedHost = document.getElementById("verified-count");
        if (verifiedHost) {
            verifiedHost.textContent = verified + "/" + MANIFEST.length;
        }
    }

    function init() {
        initCounterList();
        initThemeControls();
        applyThemeToPage();
        initReveal();
        initDemos();
        initResize();
        paintFilterBanner();
        window.setTimeout(renderAll, 120);
        window.__talosDemo = {
            state: state,
            renderAll: renderAll,
            setTheme: function (key) {
                state.theme = key;
                applyThemeToPage();
                renderAll();
            },
            setFilter: function (values) {
                state.filter = values && values.length ? { column: "Estado", values: values } : null;
                paintFilterBanner();
                renderAll();
            }
        };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
