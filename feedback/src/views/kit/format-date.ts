const DATE_TIME = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  dateStyle: "medium",
  timeStyle: "short",
});

const DATE_TIME_SECONDS = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  dateStyle: "short",
  timeStyle: "medium",
});

/** `22 nov. 2026, 14:05` in Paris time; `second` precision is for journal lines. */
export function formatDate(date: Date, precision: "minute" | "second" = "minute"): string {
  return (precision === "second" ? DATE_TIME_SECONDS : DATE_TIME).format(date);
}
