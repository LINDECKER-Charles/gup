type QueryValue = string | number | null;

/** `path?a=1&b=x`, skipping null parameters and the default first page. */
export function href(path: string, query: Readonly<Record<string, QueryValue>>): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    const isDefaultPage = name === "page" && value === 1;
    if (value !== null && !isDefaultPage) params.set(name, String(value));
  }
  const search = params.toString();
  return search === "" ? path : `${path}?${search}`;
}
