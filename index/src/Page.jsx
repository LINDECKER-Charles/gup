/**
 * Composition root, shared by the browser entry (src/app.jsx) and the
 * prerender entry (src/entry-server.jsx) — which is why it imports no CSS and
 * touches no browser global at module scope.
 *
 * Named `Page` rather than `App` on purpose: the entry file is `app.jsx`, and
 * on a case-insensitive filesystem (macOS, Windows) an `App.jsx` beside it is
 * the same file.
 */
import { Intro } from "./chrome/Intro.jsx";
import { Backdrop } from "./chrome/Backdrop.jsx";
import { StickyCta } from "./chrome/StickyCta.jsx";
import { Nav } from "./chrome/Nav.jsx";
import { Footer } from "./chrome/Footer.jsx";
import { Hero } from "./sections/Hero.jsx";
import { TerminalDemo } from "./sections/TerminalDemo.jsx";
import { Why } from "./sections/Why.jsx";
import { Platforms } from "./sections/Platforms.jsx";
import { Usage } from "./sections/Usage.jsx";
import { Architecture } from "./sections/Architecture.jsx";
import { Lifecycle } from "./sections/Lifecycle.jsx";
import { Coverage } from "./sections/Coverage.jsx";
import { Security } from "./sections/Security.jsx";
import { Install } from "./sections/Install.jsx";
import { useAmbientMotion } from "./lib/motion.jsx";

export function Page() {
  useAmbientMotion();

  return (
    <>
      <a className="skip-link" href="#top">
        Aller au contenu
      </a>

      <Intro />
      <Backdrop />
      <div className="progress" data-progress="1" aria-hidden="true" />
      <StickyCta />

      <Nav />

      <main id="top" className="page">
        <Hero />
        <TerminalDemo />
        <Why />
        <Platforms />
        <Usage />
        <Architecture />
        <Lifecycle />
        <Coverage />
        <Security />
        <Install />
      </main>

      <Footer />
    </>
  );
}
