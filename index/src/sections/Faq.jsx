/**
 * 05 · FAQ — native <details> items (keyboard, find-in-page and no-JS
 * support for free), each question an H3 inside its <summary>. The same
 * entries feed the FAQPage JSON-LD, so the structured data always describes
 * visible content. A `#faq-<id>` fragment opens its item.
 */
import { useEffect } from "react";
import { STRUCTURE } from "../data/structure.js";
import { useI18n } from "../i18n/use-i18n.js";
import { Icon } from "../ui/Icon.jsx";
import { RichText } from "../ui/RichText.jsx";
import { Section } from "../ui/Section.jsx";

function openFromHash() {
  const target = document.getElementById(window.location.hash.slice(1));
  if (target instanceof HTMLDetailsElement) target.open = true;
}

function useOpenFromHash() {
  useEffect(() => {
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);
}

export function Faq() {
  const { faq } = useI18n().messages;
  useOpenFromHash();

  return (
    <Section id="faq" kicker={faq.kicker} title={faq.title}>
      <div className="faq-list">
        {STRUCTURE.faq.map((id) => (
          <details key={id} id={`faq-${id}`} className="faq-item">
            <summary>
              <h3 className="faq-question">{faq.items[id].q}</h3>
              <Icon name="chevron" className="faq-chevron" />
            </summary>
            <p className="faq-answer">
              <RichText text={faq.items[id].a} />
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
