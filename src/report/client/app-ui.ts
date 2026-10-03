/**
 * Client building blocks shared by the report's pages: cards, empty states,
 * chart figures with their data-table twin, the tooltip, status pills and
 * badges, package buttons, filter controls and "show more" pagination.
 * Same conventions as `app-core.ts` (raw template, no backtick, no
 * dollar-brace, DOM built node by node).
 */
export const UI_JS = String.raw`
function card(title, body, action) {
  const titleId = uid("card");
  return h("section", { class: "card", "aria-labelledby": titleId }, [
    h("header", { class: "card-head" }, [h("h3", { id: titleId }, title), action || null]),
    body,
  ]);
}

function emptyState(message, hint) {
  return h("div", { class: "empty" }, [
    h("p", { class: "empty-title" }, message),
    hint ? h("p", { class: "empty-hint" }, hint) : null,
  ]);
}

/** A chart, its legend or summary, and the table that says the same in words. */
function figure(parts) {
  const table = parts.table;
  table.hidden = true;
  const toggle = h("button", { type: "button", class: "link-button", "aria-expanded": "false" },
    t("charts.showData"));
  on(toggle, "click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!isOpen));
    toggle.textContent = t(isOpen ? "charts.showData" : "charts.hideData");
    table.hidden = isOpen;
  });
  return h("figure", { class: "chart" }, [
    parts.legend || null,
    h("div", { class: "chart-frame" }, parts.chart),
    h("div", { class: "chart-actions" }, toggle),
    table,
  ]);
}

function dataTable(caption, headers, rows) {
  return h("div", { class: "table-wrap" }, h("table", { class: "data-table" }, [
    h("caption", null, caption),
    h("thead", null, h("tr", null, headers.map((header, column) =>
      h("th", { scope: "col", class: column > 0 ? "num" : null }, header)))),
    h("tbody", null, rows.map((row) => h("tr", null, row.map((cell, column) =>
      column === 0 ? h("th", { scope: "row" }, cell) : h("td", { class: "num" }, cell))))),
  ]));
}

// ---- Tooltip ---------------------------------------------------------------

/** Shows what linesOf() returns next to the element, on hover and on keyboard focus. */
function withTooltip(element, linesOf) {
  const show = () => showTooltip(element, linesOf());
  on(element, "pointerenter", show);
  on(element, "focus", show);
  on(element, "pointerleave", hideTooltip);
  on(element, "blur", hideTooltip);
  return element;
}

function showTooltip(anchor, lines) {
  const tip = byId(IDS.tooltip);
  tip.replaceChildren(...lines.map((line, index) =>
    h(index === 0 ? "strong" : "span", null, line)));
  tip.hidden = false;
  const box = anchor.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const left = Math.min(Math.max(8, box.left + box.width / 2 - width / 2),
    window.innerWidth - width - 8);
  const top = box.top - height - 10 < 8 ? box.bottom + 10 : box.top - height - 10;
  tip.style.setProperty("left", Math.round(left) + "px");
  tip.style.setProperty("top", Math.round(top) + "px");
}

function hideTooltip() {
  byId(IDS.tooltip).hidden = true;
}

// ---- Statuses, badges, packages -----------------------------------------------

function statusPill(code) {
  const name = STATUS_NAMES[code];
  return h("span", { class: "pill pill-" + name }, [
    h("span", { class: "pill-icon", "aria-hidden": "true" }, t("status." + name + ".icon")),
    t("status." + name + ".label"),
  ]);
}

function badge(content, tone) {
  return h("span", { class: "badge" + (tone ? " badge-" + tone : "") }, content);
}

function triggerBadge(trigger) {
  return badge(t("triggers." + (trigger || "unknown")), "neutral");
}

function cadenceBadge(cadence) {
  return badge(t("cadences." + cadence), "cadence-" + cadence);
}

function packageButton(index) {
  const button = h("button", { type: "button", class: "package-link", "data-package": index },
    packageAt(index).id);
  return on(button, "click", (event) => {
    event.stopPropagation();
    openPackage(index);
  });
}

function versionsText(from, to) {
  if (from === NONE && to === NONE) return "";
  return (from === NONE ? "?" : text(from)) + " → " + (to === NONE ? "?" : text(to));
}

// ---- Filters and pagination -----------------------------------------------------

/** A labelled select whose options are [value, text] pairs; calls onChange(value). */
function selectControl(caption, options, onChange) {
  const id = uid("select");
  const select = h("select", { id: id }, options.map((option) =>
    h("option", { value: option[0] }, option[1])));
  on(select, "change", () => onChange(select.value));
  return h("div", { class: "control" }, [h("label", { for: id }, caption), select]);
}

/** Options of a provider filter: every provider that attempted an update. */
function updatedProviders() {
  const options = [["", t("packages.allProviders")]];
  MODEL.providers.forEach((provider, index) => {
    if (provider.attempts > 0) options.push([String(index), provider.name]);
  });
  return options;
}

/**
 * "Afficher 50 de plus" under a list showing view.limit of its total items,
 * view.step more at each click; nothing when every item is shown.
 */
function moreButton(view, total, refresh) {
  const rest = total - Math.min(view.limit, total);
  if (rest <= 0) return null;
  const button = h("button", { type: "button", class: "button more" },
    t("common.showMore", { n: fmtNumber(Math.min(view.step, rest)), rest: fmtNumber(rest) }));
  return on(button, "click", () => {
    view.limit += view.step;
    refresh();
  });
}

function chip(caption, isPressed, onToggle) {
  const button = h("button", { type: "button", class: "chip", "aria-pressed": String(isPressed) },
    caption);
  return on(button, "click", () => {
    const pressed = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(pressed));
    onToggle(pressed);
  });
}
`;
