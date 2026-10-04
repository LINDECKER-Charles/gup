/**
 * `{ locale, messages }` of the page being rendered. Throws outside the
 * provider: a component rendered without copy is a bug to surface, not a
 * blank to ship.
 */
import { useContext } from "react";
import { I18nContext } from "./i18n-context.js";

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n() must be called under <I18nContext.Provider>");
  return value;
}
