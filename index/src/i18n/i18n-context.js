/**
 * React context carrying the current locale and its resolved messages.
 * Provided once by Page.jsx; read through ./use-i18n.js.
 */
import { createContext } from "react";

export const I18nContext = createContext(null);
