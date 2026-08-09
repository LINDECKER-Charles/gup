/**
 * Opening curtain. Purely CSS-driven (`gCurtain` + `gCurtainIn`), which is
 * what makes it safe in the prerendered HTML: with JavaScript disabled it
 * still lifts, and under `prefers-reduced-motion` the blanket duration
 * override collapses it to nothing.
 *
 * Hidden from assistive tech — it says the brand name three times and carries
 * no information the header does not.
 */
import { BrandMark } from "../ui/BrandMark.jsx";

export function Intro() {
  return (
    <div className="intro" aria-hidden="true">
      <div className="intro-inner">
        <BrandMark size={52} className="intro-mark" loading="eager" />
        <span className="intro-word">GUP</span>
        <span className="intro-rail">
          <span />
        </span>
        <span className="intro-sub">GLOBAL UPDATER</span>
      </div>
    </div>
  );
}
