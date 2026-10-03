/**
 * Composition root, shared by the browser entry (app.jsx) and the prerender
 * entry (entry-server.jsx) — which is why it imports no CSS and touches no
 * browser global outside effects.
 *
 * Named `Page` rather than `App`: on a case-insensitive filesystem an
 * `App.jsx` beside `app.jsx` would be the same file.
 */
import { useMemo } from "react";
import { Backdrop } from "./chrome/Backdrop.jsx";
import { Footer } from "./chrome/Footer.jsx";
import { Nav } from "./chrome/Nav.jsx";
import { I18nContext } from "./i18n/i18n-context.js";
import { useReveal } from "./lib/use-reveal.js";
import { Coverage } from "./sections/Coverage.jsx";
import { Faq } from "./sections/Faq.jsx";
import { Features } from "./sections/Features.jsx";
import { Hero } from "./sections/Hero.jsx";
import { HowItWorks } from "./sections/HowItWorks.jsx";
import { Install } from "./sections/Install.jsx";
import { Security } from "./sections/Security.jsx";

/**
 * @param {{ locale: import("./i18n/locales.js").Locale, messages: object }} props
 */
export function Page({ locale, messages }) {
  const i18n = useMemo(() => ({ locale, messages }), [locale, messages]);
  useReveal();

  return (
    <I18nContext.Provider value={i18n}>
      <a className="skip-link" href="#top">
        {messages.common.skipLink}
      </a>
      <Backdrop />
      <Nav />
      <main id="top" className="page" tabIndex={-1}>
        <Hero />
        <Features />
        <Coverage />
        <HowItWorks />
        <Security />
        <Faq />
        <Install />
      </main>
      <Footer />
    </I18nContext.Provider>
  );
}
