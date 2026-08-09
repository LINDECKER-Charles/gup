/**
 * Horizontal marquee rail.
 *
 * The track renders the list twice so a -50% translate loops seamlessly; the
 * whole rail is hidden from assistive tech — it is an ambient list of tool
 * names that already appear as real content in the platform cards and in the
 * linked providers catalogue, so announcing 40 duplicated chips would be pure
 * noise.
 *
 * `container` swaps the outer shell: the bordered card used in the platforms
 * section, or the borderless divider used inside the coverage panel.
 */
export function Marquee({ items, reverse = false, container = "rail", reveal }) {
  return (
    <div className={container} data-reveal={reveal} aria-hidden="true">
      <div className={`rail-track${reverse ? " rail-track--rev" : ""}`}>
        {[0, 1].map((pass) =>
          items.map((item, i) => (
            <span className="rail-item" key={`${pass}-${i}-${item}`}>
              {item}
            </span>
          )),
        )}
      </div>
    </div>
  );
}
