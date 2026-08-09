/** The terminal panel, sitting directly under the stat bar. */
import { Shell } from "../ui/Shell.jsx";
import { Terminal } from "../ui/Terminal.jsx";

export function TerminalDemo() {
  return (
    <section className="term-section" aria-label="Sortie de gup, en démonstration">
      <Shell>
        <Terminal />
      </Shell>
    </section>
  );
}
