/**
 * Client shell of the HTML report: hash routing (`#/overview`,
 * `#/packages[/<n>]`, `#/sessions?day=…`, `?pkg=` for the drawer, so Back
 * works), lazy page rendering, the header (period, truncation banner, nav
 * counts), the search box (`/` focuses it, Échap clears it), the theme
 * switch kept in localStorage, printing every page, and `boot()`.
 */
export const MAIN_JS = String.raw`
const THEME_KEY = "gup-report-theme";
const THEME_CHOICES = ["auto", "light", "dark"];

/** A page rendered on first visit; onEnter(route) runs on every visit. */
function page(name, render, onEnter) {
  const ensure = () => {
    if (state.rendered[name]) return;
    state.rendered[name] = true;
    render(document.querySelector("[data-page-section=\"" + name + "\"] .page-body"));
  };
  return {
    render: ensure,
    enter: (route) => {
      ensure();
      if (onEnter) onEnter(route);
    },
  };
}

// ---- Routing ---------------------------------------------------------------

function parseRoute(hash) {
  const raw = hash.replace(/^#\/?/, "");
  const mark = raw.indexOf("?");
  const path = (mark < 0 ? raw : raw.slice(0, mark)).split("/");
  const name = Object.prototype.hasOwnProperty.call(PAGES, path[0]) ? path[0] : "overview";
  const query = new URLSearchParams(mark < 0 ? "" : raw.slice(mark + 1));
  return { page: name, arg: path[1] || "", query: query };
}

function routeHash(name, params) {
  const query = new URLSearchParams();
  Object.keys(params).forEach((key) => {
    if (params[key]) query.set(key, params[key]);
  });
  const search = query.toString();
  return "#/" + name + (search === "" ? "" : "?" + search);
}

function navigate(hash) {
  if (location.hash === hash) onRoute();
  else location.hash = hash;
}

function onRoute() {
  const route = parseRoute(location.hash);
  state.route = route;
  showPage(route.page);
  PAGES[route.page].enter(route);
  syncDrawer(route);
  if (!byId(IDS.drawer).open) restoreFocus();
}

function showPage(name) {
  document.querySelectorAll("[data-page-section]").forEach((section) => {
    section.hidden = section.getAttribute("data-page-section") !== name;
  });
  document.querySelectorAll("[data-nav]").forEach((item) => {
    if (item.getAttribute("data-nav") === name) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  const hasChanged = state.page !== name;
  state.page = name;
  if (hasChanged && state.focusPage) {
    const heading = document.querySelector("[data-page-section=\"" + name + "\"] h2");
    if (heading !== null) heading.focus();
  }
  state.focusPage = false;
}

// ---- Header ----------------------------------------------------------------

function initHeader() {
  byId(IDS.period).textContent = periodText();
  const banner = byId(IDS.banner);
  banner.hidden = MODEL.truncated === 0;
  banner.textContent = t("banner.truncated", { kept: fmtNumber(MODEL.updates.length) });
  const counts = {
    packages: MODEL.packages.length,
    failures: MODEL.totals.failures,
    sessions: MODEL.runs.length,
  };
  document.querySelectorAll("[data-nav]").forEach((item) => {
    const name = item.getAttribute("data-nav");
    on(item, "click", () => {
      state.focusPage = true;
    });
    const badge = item.querySelector(".nav-count");
    if (badge !== null && counts[name] !== undefined) badge.textContent = fmtNumber(counts[name]);
  });
}

function periodText() {
  if (META.period.firstDay === null && MODEL.days.length === 0) return META.period.label;
  const range = periodRange();
  const days = { from: fmtDay(range.start), to: fmtDay(range.end) };
  return t("header.period", Object.assign({ label: META.period.label }, days));
}

function initFooter() {
  byId(IDS.generated).textContent = t("footer.generated", {
    version: META.gup,
    date: fmtDateTime(GENERATED_AT),
    zone: ZONE || "UTC",
  });
  const notes = [];
  if (META.stats.malformed > 0) notes.push(tn("footer.malformed", META.stats.malformed));
  if (META.stats.unsupported > 0) notes.push(tn("footer.unsupported", META.stats.unsupported));
  const readNotes = byId(IDS.readNotes);
  readNotes.textContent = notes.join(" ");
  readNotes.hidden = notes.length === 0;
}

// ---- Search ----------------------------------------------------------------

function initSearch() {
  const input = byId(IDS.search);
  on(input, "input", () => applySearch(input.value));
  on(input, "keydown", (event) => {
    if (event.key === "Escape" && input.value !== "") {
      event.preventDefault();
      setSearch("");
    } else if (event.key === "Enter") {
      navigate("#/packages");
    }
  });
  on(document, "keydown", (event) => {
    if (!isSearchShortcut(event)) return;
    event.preventDefault();
    input.focus();
  });
}

/** "/" typed anywhere but in a field. */
function isSearchShortcut(event) {
  if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return false;
  return !isEditable(event.target);
}

function applySearch(value) {
  state.query = value.trim();
  packagesTable.limit = PAGE_SIZE;
  if (state.route.page === "packages") refreshPackages();
  else if (state.query !== "") navigate("#/packages");
}

function setSearch(value) {
  byId(IDS.search).value = value;
  applySearch(value);
}

function isEditable(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

// ---- Theme -----------------------------------------------------------------

function initTheme() {
  applyTheme(storedTheme());
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    on(button, "click", () => {
      const choice = button.getAttribute("data-theme-choice");
      applyTheme(choice);
      storeTheme(choice);
    });
  });
}

function applyTheme(choice) {
  const root = document.documentElement;
  if (choice === "light" || choice === "dark") root.setAttribute("data-theme", choice);
  else root.removeAttribute("data-theme");
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    const isChosen = button.getAttribute("data-theme-choice") === choice;
    button.setAttribute("aria-pressed", String(isChosen));
  });
}

/** localStorage may be refused on file:// pages: the choice then lasts for this visit. */
function storedTheme() {
  try {
    const choice = localStorage.getItem(THEME_KEY);
    return THEME_CHOICES.indexOf(choice) >= 0 ? choice : "auto";
  } catch {
    return "auto";
  }
}

function storeTheme(choice) {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Kept for this visit only.
  }
}

// ---- Print -----------------------------------------------------------------

/** Printing shows every page (CSS), with every row of every list. */
function initPrint() {
  on(byId(IDS.print), "click", () => window.print());
  on(window, "beforeprint", () => {
    Object.keys(PAGES).forEach((name) => PAGES[name].render());
    packagesTable.limit = Infinity;
    failuresView.limit = Infinity;
    sessionsView.limit = Infinity;
    refreshLists();
  });
  on(window, "afterprint", () => {
    packagesTable.limit = PAGE_SIZE;
    failuresView.limit = FAILURES_PAGE;
    sessionsView.limit = SESSIONS_PAGE;
    refreshLists();
  });
}

function refreshLists() {
  refreshPackages();
  refreshFailures();
  refreshSessions();
}

function boot() {
  initTheme();
  initHeader();
  initFooter();
  initSearch();
  initDrawer();
  initPrint();
  on(window, "hashchange", onRoute);
  onRoute();
}
`;
