/**
 * Client "Échecs" and "Sessions" pages. Échecs groups failed attempts by
 * package and message, most frequent first. Sessions lists every gup run by
 * day, newest first, each a native `<details>` whose attempts are built when
 * it opens; chips filter by outcome, a select by provider, and a day chosen
 * in the calendar narrows the list until it is cleared.
 */
export const ACTIVITY_JS = String.raw`
const FAILURES_PAGE = 50;
const SESSIONS_PAGE = 50;
const sessionsView = {
  statuses: [true, true, true],
  provider: "",
  day: "",
  limit: SESSIONS_PAGE,
  days: null,
  shownDay: null,
};
const failuresView = { limit: FAILURES_PAGE };
let rowsByRun = null;

PAGES.failures = page("failures", renderFailures);
// Redrawn only when the day asked for changes: opening a package from a session and
// closing it again must leave the sessions as they were (open ones stay open).
PAGES.sessions = page("sessions", renderSessions, (route) => {
  const day = route.query.get("day") || "";
  if (day === sessionsView.shownDay) return;
  sessionsView.day = day;
  refreshSessions();
});

// ---- Failures -------------------------------------------------------------------

function renderFailures(body) {
  if (MODEL.failures.length === 0) {
    body.append(emptyState(t("failures.none"), t("failures.noneHint")));
    return;
  }
  const packages = new Set(MODEL.failures.map((failure) => failure.package)).size;
  appendAll(body, [
    h("p", { class: "page-intro" }, t("failures.intro", {
      failures: tn("units.failures", MODEL.totals.failures),
      packages: tn("units.packages", packages),
    })),
    h("div", { class: "failure-list", id: IDS.failuresList }),
    h("div", { class: "more-slot", id: IDS.failuresMore }),
  ]);
  refreshFailures();
}

function refreshFailures() {
  const list = byId(IDS.failuresList);
  if (list === null) return;
  list.replaceChildren(...MODEL.failures.slice(0, failuresView.limit).map(failureCard));
  const more = byId(IDS.failuresMore);
  more.replaceChildren();
  const total = MODEL.failures.length;
  appendAll(more, moreButton(Math.min(failuresView.limit, total), total, () => {
    failuresView.limit += FAILURES_PAGE;
    refreshFailures();
  }));
}

function failureCard(failure) {
  const open = h("button", { type: "button", class: "link-button failure-open" },
    t("failures.open"));
  on(open, "click", () => openPackage(failure.package));
  return h("article", { class: "failure-card" }, [
    h("header", { class: "failure-head" }, [
      h("span", { class: "failure-times" }, t("failures.times", { n: fmtNumber(failure.count) })),
      h("h3", null, packageButton(failure.package)),
      h("span", { class: "muted" }, providerOf(failure.package).name),
      open,
    ]),
    h("p", { class: "failure-last" }, t("failures.last", { when: fmtDateTime(failure.lastAt) })),
    h("pre", { class: "message" }, text(failure.message) || t("failures.noMessage")),
  ]);
}

// ---- Sessions -------------------------------------------------------------------

function renderSessions(body) {
  if (MODEL.runs.length === 0) {
    body.append(emptyState(t("sessions.none")));
    return;
  }
  appendAll(body, [
    h("div", { class: "toolbar" }, [
      statusChips(),
      selectControl(t("sessions.provider"), updatedProviders(), (value) => {
        sessionsView.provider = value;
        refreshSessions();
      }),
      h("p", { class: "result-count", id: IDS.sessionsCount }),
    ]),
    h("div", { class: "day-filter", id: IDS.sessionsDay, hidden: true }),
    h("div", { class: "session-days", id: IDS.sessionsList }),
    h("div", { class: "more-slot", id: IDS.sessionsMore }),
  ]);
}

function statusChips() {
  return h("div", { class: "chips", role: "group", "aria-label": t("sessions.statuses") },
    STATUS_NAMES.map((name, code) =>
      chip(t("status." + name + ".icon") + " " + t("legend." + name), true, (isPressed) => {
        sessionsView.statuses[code] = isPressed;
        refreshSessions();
      })));
}

function refreshSessions() {
  const list = byId(IDS.sessionsList);
  if (list === null) return;
  sessionsView.shownDay = sessionsView.day;
  const runs = filteredRuns();
  list.replaceChildren(...sessionGroups(runs.slice(0, sessionsView.limit)));
  if (runs.length === 0) list.append(emptyState(t("sessions.noMatch")));
  byId(IDS.sessionsCount).textContent = tn("units.sessions", runs.length);
  announce(tn("units.sessions", runs.length));
  updateDayFilter();
  const more = byId(IDS.sessionsMore);
  more.replaceChildren();
  appendAll(more, moreButton(Math.min(runs.length, sessionsView.limit), runs.length, () => {
    sessionsView.limit += SESSIONS_PAGE;
    refreshSessions();
  }));
}

function updateDayFilter() {
  const filter = byId(IDS.sessionsDay);
  filter.hidden = sessionsView.day === "";
  if (filter.hidden) return;
  filter.replaceChildren(
    h("span", null, t("sessions.day", { day: fmtLongDay(dayIndex(sessionsView.day)) })),
    link("#/sessions", t("sessions.clearDay"), "link-button"),
  );
}

/** Runs passing the filters, each with its attempts that pass them. */
function filteredRuns() {
  if (rowsByRun === null) rowsByRun = indexBy(ROW.run);
  const isUnfiltered = sessionsView.provider === "" && sessionsView.statuses.every(Boolean);
  return MODEL.runs.map((run, index) => {
    const attempts = rowsByRun.get(index) || [];
    const passing = attempts.filter(attemptPasses);
    return { run: run, index: index, total: attempts.length, attempts: passing };
  }).filter((item) =>
    (sessionsView.day === "" || runDay(item.index) === sessionsView.day) &&
    (item.attempts.length > 0 || (item.total === 0 && isUnfiltered)));
}

function attemptPasses(row) {
  if (!sessionsView.statuses[row[ROW.status]]) return false;
  if (sessionsView.provider === "") return true;
  return String(packageAt(row[ROW.package]).provider) === sessionsView.provider;
}

function runDay(index) {
  if (sessionsView.days === null) {
    sessionsView.days = MODEL.runs.map((run) => dayOfInstant(run.startedAt));
  }
  return sessionsView.days[index];
}

/** Runs grouped under the day they started, newest day first. */
function sessionGroups(items) {
  const groups = [];
  items.forEach((item) => {
    const day = runDay(item.index);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day: day, items: [item] });
  });
  return groups.map((group) => {
    const titleId = uid("session-day");
    return h("section", { class: "session-day", "aria-labelledby": titleId }, [
      h("h3", { id: titleId }, fmtLongDay(dayIndex(group.day))),
      h("div", { class: "session-list" }, group.items.map(sessionDetails)),
    ]);
  });
}

function sessionDetails(item) {
  const run = item.run;
  const list = h("ol", { class: "attempts" });
  const details = h("details", { class: "session" }, [
    h("summary", null, [
      h("time", { class: "session-time", datetime: new Date(run.startedAt).toISOString() },
        fmtTime(run.startedAt)),
      triggerBadge(run.trigger),
      h("span", { class: "session-stats" }, sessionStats(run)),
      // Always there, empty or not, so that the disclosure mark stays at the right edge.
      h("span", { class: "session-outdated" },
        run.lastOutdated === null ? "" : tn("units.outdated", run.lastOutdated)),
    ]),
    list,
  ]);
  on(details, "toggle", () => {
    if (details.open && list.childElementCount === 0) fillSession(list, item);
  });
  return details;
}

function sessionStats(run) {
  const parts = [tn("units.scans", run.scans)];
  [run.successes, run.failures, run.skips].forEach((count, code) => {
    if (count === 0) return;
    const icon = t("status." + STATUS_NAMES[code] + ".icon");
    parts.push(icon + " " + tn("units." + STATUS_UNITS[code], count));
  });
  return parts.join(" · ");
}

function fillSession(list, item) {
  if (item.attempts.length === 0) {
    list.append(h("li", { class: "muted" }, t("sessions.scanOnly")));
    return;
  }
  item.attempts.forEach((row) => {
    const heading = h("span", { class: "attempt-package" }, [
      packageButton(row[ROW.package]),
      h("span", { class: "muted" }, providerOf(row[ROW.package]).name),
    ]);
    list.append(attemptItem(row, heading));
  });
}
`;
