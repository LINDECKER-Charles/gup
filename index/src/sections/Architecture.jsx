/**
 * 04 · Architecture — a sticky scroll stage.
 *
 * The outer element is 340vh tall; its inner panel sticks, so scrolling
 * advances a five-beat narration in place: argv → registry → fan-out →
 * runner. `useStageProgress` returns the element's own 0→1 progress, and
 * returns 1 during SSR and under reduced motion — so the prerendered HTML and
 * the reduced-motion render both show the finished, fully-lit diagram instead
 * of an empty stage.
 *
 * Beat boundaries live in one table below rather than being scattered as
 * magic numbers across the JSX.
 */
import { useRef } from "react";
import { Shell } from "../ui/Shell.jsx";
import { SectionLabel } from "../ui/SectionLabel.jsx";
import { useStageProgress } from "../lib/motion.jsx";
import { facts } from "../data/facts.js";
import { architecture } from "../data/content.js";

const BEAT_COUNT = 4;
/** Progress is cut into five equal slices; slice 0 is the resting state. */
const BEAT_SIZE = 1 / (BEAT_COUNT + 1);
/** Where each wire starts filling, and over how much progress. */
const WIRES = [
  { from: 0.18, span: 0.16 },
  { from: 0.62, span: 0.16 },
];
/** The fan-out chips light up one after another from this point on. */
const FAN_FROM = 0.44;
const FAN_STEP = 0.014;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * The four contract cards that sit under the stage. Rendered as a sibling
 * section rather than inside it: the stage is a 340vh sticky container, and
 * nesting ordinary flow content in it would drag the cards into the scroll
 * choreography.
 */
function ContractCards() {
  return (
    <section aria-label="Les quatre couches de gup">
      <Shell>
        <ul className="arch-cards" data-reveal="22">
          {architecture.cards.map((card) => (
            <li className="card card--tilt arch-card" data-tilt="1" key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
            </li>
          ))}
        </ul>
      </Shell>
    </section>
  );
}

function Node({ label, caption, lit, wide }) {
  return (
    <div className="pipeline-node">
      <div
        className={`pipeline-box${wide ? " pipeline-box--wide" : ""}`}
        data-on={lit ? "1" : "0"}
      >
        {label}
      </div>
      <span className="pipeline-caption">{caption}</span>
    </div>
  );
}

function Wire({ fill, warm }) {
  return (
    <div className={`pipeline-wire${warm ? " pipeline-wire--warm" : ""}`}>
      <span style={{ width: `${fill * 100}%` }} />
    </div>
  );
}

export function Architecture() {
  const stage = useRef(null);
  const scrolled = useStageProgress(stage);
  // `null` = nothing to read from the scroll position (SSR, first render,
  // reduced motion): show the diagram complete and narrate the summary.
  const isStatic = scrolled === null;
  const progress = isStatic ? 1 : scrolled;
  const beat = isStatic ? 0 : Math.min(BEAT_COUNT, Math.floor(progress / BEAT_SIZE));
  const lit = (from) => isStatic || beat >= from;

  return (
    <>
    <section
      className="stage"
      id="architecture"
      ref={stage}
      aria-labelledby="architecture-title"
    >
      <div className="stage-sticky">
        <Shell>
          <SectionLabel
            trailing={
              isStatic ? null : (
                <span className="stage-beat-label">
                  {`BEAT ${String(Math.max(1, beat)).padStart(2, "0")} / 0${BEAT_COUNT}`}
                </span>
              )
            }
          >
            {architecture.label}
          </SectionLabel>

          <h2
            className="display display--section stage-title"
            id="architecture-title"
          >
            {architecture.title}
          </h2>
          <p className="stage-narration">
            {architecture.beats[beat]}
            {isStatic || beat > 0 ? null : (
              <span className="stage-hint"> {architecture.scrollHint}</span>
            )}
          </p>

          <div className="pipeline">
            <div className="pipeline-row">
              <Node
                label={
                  <>
                    <span className="cmd-prompt" aria-hidden="true">
                      $
                    </span>
                    gup
                  </>
                }
                caption="ARGV"
                lit={lit(1)}
              />
              <Wire fill={clamp01((progress - WIRES[0].from) / WIRES[0].span)} />
              <Node
                label="core/registry"
                caption="pLimit(4) · FAN-OUT"
                lit={lit(2)}
                wide
              />
              <Wire
                fill={clamp01((progress - WIRES[1].from) / WIRES[1].span)}
                warm
              />
              <Node label="core/runner" caption="EXECA · NO SHELL" lit={lit(4)} />
            </div>

            <ul className="pipeline-fan">
              {architecture.fanout.map((name, i) => (
                <li
                  key={name}
                  data-on={progress > FAN_FROM + i * FAN_STEP ? "1" : "0"}
                >
                  {name}
                </li>
              ))}
              <li className="pipeline-fan-rest">… × {facts.providerCount}</li>
            </ul>
          </div>
        </Shell>
      </div>
    </section>

    <ContractCards />
    </>
  );
}
