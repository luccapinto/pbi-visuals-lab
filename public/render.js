/**
 * Monta a página a partir do manifest gerado por tools/make_site.py:
 * cartões de demonstração, tabela comparativa e a seção de verificação.
 */
(function () {
    "use strict";

    var MANIFEST = window.TALOS_VISUALS || [];

    function ordinal(number) {
        return String(number + 1).padStart(2, "0");
    }

    function roleLabel(role) {
        return role.kind === "Measure" ? "medida" : "agrupamento";
    }

    function buildCard(spec, index) {
        var card = document.createElement("article");
        card.className = "demo reveal";
        card.id = "visual-" + spec.slug;

        var head = document.createElement("header");
        head.className = "demo-head";

        var title = document.createElement("div");
        title.className = "demo-title";
        var indexNode = document.createElement("span");
        indexNode.className = "demo-index";
        indexNode.textContent = ordinal(index);
        var nameNode = document.createElement("h3");
        nameNode.textContent = spec.displayName;
        title.appendChild(indexNode);
        title.appendChild(nameNode);

        var pills = document.createElement("div");
        pills.className = "demo-pills";
        spec.roles.forEach(function (role) {
            var pill = document.createElement("span");
            pill.className = "pill";
            pill.textContent = role.name + " · " + roleLabel(role);
            pills.appendChild(pill);
        });

        head.appendChild(title);
        head.appendChild(pills);

        var subtitle = document.createElement("p");
        subtitle.className = "demo-sub";
        subtitle.textContent = spec.subtitle || spec.description;

        var mount = document.createElement("div");
        mount.className = "demo-mount";
        mount.setAttribute("data-visual", spec.slug);

        var foot = document.createElement("footer");
        foot.className = "demo-foot";

        var hints = document.createElement("span");
        hints.className = "demo-hints";
        hints.textContent = hintsFor(spec.slug);

        var links = document.createElement("span");
        links.className = "demo-links";

        var download = document.createElement("a");
        download.href = "downloads/talos-" + spec.slug + ".pbiviz";
        download.setAttribute("download", "");
        download.className = "btn-link";
        download.textContent = "baixar .pbiviz (" + Math.round(spec.bytes / 1024) + " KB)";
        links.appendChild(download);

        foot.appendChild(hints);
        foot.appendChild(links);

        card.appendChild(head);
        card.appendChild(subtitle);
        card.appendChild(mount);
        card.appendChild(foot);
        return card;
    }

    function hintsFor(slug) {
        var map = {
            dumbbell: "passe o mouse na linha para comparar · clique para destacar",
            ring: "passe o mouse numa fatia · clique para selecionar",
            dotmatrix: "cada célula é um estado · clique para destacar",
            matrixheat: "cruze linha e coluna · o maior valor fica marcado",
            horizon: "mova o mouse na faixa para ler o valor exato",
            radar: "clique na legenda para esconder um perfil",
            sankey: "passe o mouse num nó para isolar os caminhos dele",
            glyph: "a linha tracejada é o valor inicial, a barra é o final",
            slicer: "clique para filtrar todos os outros visuais desta página",
            sqlfilter: "clique numa linha: o predicado entra no WHERE e filtra a página",
            game: "digite um chute e pressione Enter · 8 rodadas por partida"
        };
        return map[slug] || "teste as interações";
    }

    function buildGrid() {
        var grid = document.getElementById("grid");
        if (!grid) {
            return;
        }
        MANIFEST.forEach(function (spec, index) {
            grid.appendChild(buildCard(spec, index));
        });
    }

    function buildTable() {
        var body = document.getElementById("table-body");
        if (!body) {
            return;
        }
        MANIFEST.forEach(function (spec) {
            var row = document.createElement("tr");

            var nameCell = document.createElement("td");
            var link = document.createElement("a");
            link.href = "#visual-" + spec.slug;
            link.textContent = spec.displayName;
            nameCell.appendChild(link);

            var kindCell = document.createElement("td");
            kindCell.textContent =
                spec.mapping === "grouped" ? "categórico com séries" : spec.mapping === "table" ? "tabela" : "categórico";

            var fieldsCell = document.createElement("td");
            fieldsCell.textContent = spec.roles.map(function (role) { return role.name; }).join(" + ");

            var sizeCell = document.createElement("td");
            sizeCell.className = "num";
            sizeCell.textContent = Math.round(spec.bytes / 1024) + " KB";

            row.appendChild(nameCell);
            row.appendChild(kindCell);
            row.appendChild(fieldsCell);
            row.appendChild(sizeCell);
            body.appendChild(row);
        });
    }

    function buildVerification() {
        var body = document.getElementById("verify-body");
        if (!body) {
            return;
        }
        MANIFEST.forEach(function (spec) {
            var verify = spec.verify || {};
            var row = document.createElement("tr");

            var nameCell = document.createElement("td");
            nameCell.textContent = spec.displayName;

            var statusCell = document.createElement("td");
            statusCell.className = verify.ok ? "ok" : "fail";
            statusCell.textContent = verify.ok ? "renderizou" : "falhou";

            var nodesCell = document.createElement("td");
            nodesCell.className = "num";
            nodesCell.textContent = verify.nodes === undefined ? "—" : String(verify.nodes);

            var resizeCell = document.createElement("td");
            resizeCell.className = "num";
            resizeCell.textContent = verify.resizedNodes === undefined ? "—" : String(verify.resizedNodes);

            var emptyCell = document.createElement("td");
            emptyCell.className = "num";
            emptyCell.textContent = verify.emptyStateNodes === undefined ? "—" : String(verify.emptyStateNodes);

            var formattingCell = document.createElement("td");
            formattingCell.className = "num";
            formattingCell.textContent =
                verify.formattingCards === undefined ? "—" : verify.formattingCards + " cards / " + verify.formattingSlices + " controles";

            var interactionsCell = document.createElement("td");
            interactionsCell.className = "num";
            interactionsCell.textContent = [
                verify.tooltipsShown + " tooltips",
                verify.selections + " seleções",
                verify.contextMenus + " menus",
                verify.filtersApplied + " filtros"
            ].join(" · ");

            row.appendChild(nameCell);
            row.appendChild(statusCell);
            row.appendChild(nodesCell);
            row.appendChild(resizeCell);
            row.appendChild(emptyCell);
            row.appendChild(formattingCell);
            row.appendChild(interactionsCell);
            body.appendChild(row);
        });
    }

    function buildTotals() {
        var verified = MANIFEST.filter(function (spec) {
            return spec.verify && spec.verify.ok;
        }).length;
        var nodes = MANIFEST.reduce(function (total, spec) {
            return total + ((spec.verify && spec.verify.nodes) || 0);
        }, 0);
        var slices = MANIFEST.reduce(function (total, spec) {
            return total + ((spec.verify && spec.verify.formattingSlices) || 0);
        }, 0);

        setText("total-visuals", String(MANIFEST.length));
        setText("total-verified", verified + "/" + MANIFEST.length);
        setText("total-nodes", String(nodes));
        setText("total-slices", String(slices));
        setText("total-bytes", (MANIFEST.reduce(function (total, spec) { return total + spec.bytes; }, 0) / 1024).toFixed(0) + " KB");
    }

    function setText(id, text) {
        var node = document.getElementById(id);
        if (node) {
            node.textContent = text;
        }
    }

    function init() {
        buildGrid();
        buildTable();
        buildVerification();
        buildTotals();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
