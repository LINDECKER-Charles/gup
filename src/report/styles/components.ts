/**
 * The report's components: hero and key numbers, cards, charts and their
 * legends, the calendar heatmap, tables, status pills and badges, the
 * failures and sessions lists, the package drawer and the tooltip.
 */
export const COMPONENTS_CSS = String.raw`
.hero{
  display:grid;grid-template-columns:auto 1fr;align-items:center;gap:8px 28px;padding:24px 28px;
  border:1px solid var(--border);border-radius:16px;background:var(--surface);
  box-shadow:var(--shadow);
}
.hero-figure{display:flex;flex-direction:column}
.hero-number{font-size:56px;line-height:1;font-weight:700;letter-spacing:-.03em}
.hero-unit{margin-top:6px;color:var(--muted);font-weight:550}
.hero-sentence{font-size:19px;line-height:1.45;font-weight:550;max-width:60ch}
.hero-note{margin-top:6px;color:var(--muted)}

.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.kpi{
  border:1px solid var(--border);border-radius:14px;background:var(--surface);
  box-shadow:var(--shadow);
}
.kpi-link,.kpi-body{
  display:flex;flex-direction:column;gap:2px;height:100%;padding:14px 16px;color:inherit;
  text-decoration:none;border-radius:14px;
}
.kpi-link:hover{background:var(--surface-hover)}
.kpi-value{font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-.02em}
.kpi-label{font-weight:600}
.kpi-hint{color:var(--muted);font-size:13px;line-height:1.35}
.kpi-failed{border-color:var(--fail);box-shadow:inset 3px 0 0 var(--fail)}
.kpi-failed .kpi-value{color:var(--fail)}

.card{
  border:1px solid var(--border);border-radius:16px;background:var(--surface);
  box-shadow:var(--shadow);padding:18px 20px 20px;min-width:0;
}
.card-head{
  display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px;
}
.card-head h3{font-size:16px;font-weight:650}
.card-link{font-size:14px;font-weight:550;white-space:nowrap}
.card-intro{margin:-6px 0 12px;color:var(--muted);font-size:14px}
.card-actions{margin-top:12px;display:flex;gap:10px}
.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr));gap:20px}
.empty{padding:22px 4px;text-align:center}
.empty-title{font-weight:600}
.empty-hint{margin-top:4px;color:var(--muted);font-size:14px}

.chart-frame{width:100%}
.chart-svg{display:block;width:100%;height:auto;overflow:visible}
.chart-summary{
  color:var(--muted);font-size:14px;margin-bottom:6px;font-variant-numeric:tabular-nums;
}
.chart-actions{margin-top:6px}
.legend{
  display:flex;flex-wrap:wrap;gap:6px 16px;margin-bottom:8px;color:var(--muted);font-size:13.5px;
}
.legend li{display:inline-flex;align-items:center;gap:6px}
.tick-label{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.grid{stroke:var(--grid);stroke-width:1}
.axis{stroke:var(--border-strong);stroke-width:1}
.mark-success{fill:var(--ok)}
.mark-failed{fill:url(#pattern-failed)}
.mark-skipped{fill:url(#pattern-skipped)}
.pattern-base-failed{fill:var(--fail)}
.pattern-ink-failed{fill:var(--fail-ink)}
.pattern-base-skipped{fill:var(--skip)}
.pattern-ink-skipped{fill:var(--skip-ink)}
.hit{fill:transparent;cursor:crosshair}
.column:hover .mark{opacity:.82}
.line{fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.area{fill:var(--accent);fill-opacity:.1;stroke:none}
.end-dot{fill:var(--accent);stroke:var(--surface);stroke-width:2}
.crosshair{stroke:var(--border-strong);stroke-width:1}

.heat-scroll{overflow-x:auto;padding-bottom:4px;container-type:inline-size}
.heat{
  --gap:3px;--cell:clamp(10px,calc((100cqi - 34px) / var(--weeks) - var(--gap)),16px);
  display:inline-flex;flex-direction:column;gap:4px;min-width:max-content;
}
.heat-months,.heat-row{
  display:grid;grid-template-columns:repeat(var(--weeks),var(--cell));gap:var(--gap);
}
.heat-months{margin-left:34px;color:var(--muted);font-size:11px;line-height:1}
.heat-months span{white-space:nowrap}
.heat-body{display:flex;gap:6px}
.heat-days{
  display:grid;grid-template-rows:repeat(7,var(--cell));gap:var(--gap);width:28px;
  color:var(--muted);font-size:10.5px;line-height:var(--cell);
}
.heat-rows{display:grid;gap:var(--gap)}
.cell{width:var(--cell);height:var(--cell);border-radius:3px;background:var(--heat-1)}
.cell[data-level="0"]{background:radial-gradient(circle,var(--heat-0) 0 1.6px,transparent 2px)}
.cell[data-level="2"]{background:var(--heat-2)}
.cell[data-level="3"]{background:var(--heat-3)}
.cell[data-level="4"]{background:var(--heat-4)}
.cell-out{visibility:hidden}
[role="gridcell"]{cursor:pointer}
[role="gridcell"]:hover,[role="gridcell"]:focus-visible{
  outline:2px solid var(--text);outline-offset:1px;
}
.heat-legend{
  --cell:11px;display:inline-flex;align-items:center;gap:4px;color:var(--muted);font-size:12.5px;
}
.heat-legend .cell{display:inline-block}
.heat-legend span:first-child{margin-right:4px}
.heat-legend span:last-child{margin-left:4px}
.day-detail{
  display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;padding:14px 16px;
  border:1px solid var(--border);border-radius:12px;background:var(--surface);
}
.day-title{font-weight:650}
.day-summary{color:var(--muted)}
.day-detail .button{margin-left:auto}

.table-wrap{
  overflow-x:auto;border:1px solid var(--border);border-radius:12px;background:var(--surface);
}
.card .table-wrap{border-radius:10px}
table{width:100%;border-collapse:collapse;font-size:14px}
caption{
  position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;
}
th,td{padding:9px 12px;text-align:left;vertical-align:middle;border-bottom:1px solid var(--border)}
thead th{
  position:sticky;top:0;background:var(--surface-2);color:var(--muted);font-size:13px;
  font-weight:600;white-space:nowrap;
}
tbody tr:last-child>*{border-bottom:0}
tbody th{font-weight:550}
.num{text-align:right;font-variant-numeric:tabular-nums}
.packages tbody tr{cursor:pointer}
.packages tbody tr:hover{background:var(--surface-hover)}
.sort{
  display:inline-flex;align-items:center;gap:4px;border:0;background:none;padding:2px 0;
  color:inherit;font:inherit;cursor:pointer;
}
.sort:hover{color:var(--text)}
th[aria-sort] .sort{color:var(--text)}
.sort-icon{min-width:.8em;color:var(--accent)}
.no-match{padding:28px 12px;text-align:center;color:var(--muted)}
.package-link{
  border:0;background:none;padding:0;color:var(--accent);font:inherit;font-weight:600;
  text-align:left;cursor:pointer;text-decoration:underline;text-decoration-color:transparent;
  text-underline-offset:2px;overflow-wrap:anywhere;
}
.package-link:hover{text-decoration-color:currentColor}
.failure-count{color:var(--fail);font-weight:650}

.pill{
  display:inline-flex;align-items:center;gap:5px;padding:1px 9px 1px 7px;border-radius:999px;
  font-size:13px;font-weight:600;white-space:nowrap;
}
.pill-success{background:var(--ok-weak);color:var(--ok)}
.pill-failed{background:var(--fail-weak);color:var(--fail)}
.pill-skipped{background:var(--skip-weak);color:var(--skip)}
.badge{
  display:inline-flex;align-items:center;padding:1px 8px;border:1px solid var(--border);
  border-radius:999px;background:var(--surface-2);color:var(--muted);font-size:12.5px;
  font-weight:550;white-space:nowrap;
}
.badge-cadence-weekly,.badge-cadence-monthly{
  background:var(--accent-weak);border-color:transparent;color:var(--accent);
}
.badge-cadence-none{background:var(--fail-weak);border-color:transparent;color:var(--fail)}

.watch-list,.top-list{display:flex;flex-direction:column;gap:12px}
.watch-item{
  padding:12px 14px;border:1px solid var(--border);border-left:3px solid var(--fail);
  border-radius:10px;
}
.watch-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}
.watch-count{color:var(--fail);font-weight:700;font-variant-numeric:tabular-nums}
.watch-message{
  margin-top:6px;color:var(--muted);font-size:14px;overflow-wrap:anywhere;display:-webkit-box;
  -webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.top-item{
  display:grid;grid-template-columns:minmax(0,1.4fr) minmax(80px,1fr) auto;align-items:center;
  gap:12px;
}
.top-name{display:flex;flex-direction:column;min-width:0}
.top-name .muted{font-size:13px}
.meter{display:block;height:8px;border-radius:999px;background:var(--surface-2);overflow:hidden}
.meter-fill{
  display:block;height:100%;width:calc(var(--ratio,0)*100%);border-radius:999px;
  background:var(--ok);
}
.top-count{color:var(--muted);font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}

.failure-list{display:flex;flex-direction:column;gap:12px}
.failure-card{
  padding:16px 18px;border:1px solid var(--border);border-left:3px solid var(--fail);
  border-radius:12px;background:var(--surface);box-shadow:var(--shadow);
}
.failure-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin-bottom:2px}
.failure-head h3{font-size:16px}
.failure-times{color:var(--fail);font-weight:700;font-variant-numeric:tabular-nums}
.failure-open{margin-left:auto}
.failure-last{color:var(--muted);font-size:14px}
.message{
  margin-top:10px;padding:10px 12px;border-radius:8px;background:var(--surface-2);font-size:13px;
  line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;max-height:16em;overflow:auto;
}

.session-days{display:flex;flex-direction:column;gap:22px}
.session-day h3{margin-bottom:8px;font-size:15px;font-weight:650}
.session-list{
  display:flex;flex-direction:column;border:1px solid var(--border);border-radius:12px;
  background:var(--surface);overflow:hidden;
}
.session+.session{border-top:1px solid var(--border)}
.session summary{
  display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:11px 14px;cursor:pointer;
}
.session summary:hover{background:var(--surface-hover)}
.session summary::-webkit-details-marker{display:none}
.session summary::after{
  content:"";width:7px;height:7px;margin:0 4px 3px 6px;border-right:2px solid var(--muted);
  border-bottom:2px solid var(--muted);transform:rotate(45deg)
}
.session[open] summary::after{margin-bottom:-3px;transform:rotate(225deg)}
.session-time{font-weight:650;font-variant-numeric:tabular-nums;min-width:3.2em}
.session-stats{color:var(--muted);font-size:14px}
.session-outdated{margin-left:auto;color:var(--muted);font-size:13.5px}
.session .attempts{padding:4px 14px 14px}

.attempts{display:flex;flex-direction:column}
.attempt{padding:10px 0;border-top:1px solid var(--border)}
.attempt:first-child{border-top:0}
.attempt-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;font-size:14px}
.attempt-head time,.duration{color:var(--muted);font-variant-numeric:tabular-nums}
.attempt-package{display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:6px}
.versions{font-variant-numeric:tabular-nums;overflow-wrap:anywhere}

.drawer{
  width:min(620px,100vw);max-width:100vw;height:100dvh;max-height:100dvh;margin:0 0 0 auto;
  padding:0;border:0;border-left:1px solid var(--border);background:var(--surface);
  color:var(--text);box-shadow:-12px 0 32px rgba(0,0,0,.18);
}
.drawer::backdrop{background:var(--overlay)}
.drawer-panel{display:flex;flex-direction:column;height:100%}
.drawer-head{
  display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 22px 16px;
  border-bottom:1px solid var(--border);
}
.drawer-heading{min-width:0}
.drawer-kicker{color:var(--muted);font-size:13.5px;font-weight:550}
.drawer-head h2{font-size:21px;line-height:1.3;font-weight:650;overflow-wrap:anywhere}
.drawer-actions{display:flex;gap:8px;flex-shrink:0}
.drawer-body{
  flex:1;overflow-y:auto;padding:18px 22px 28px;display:flex;flex-direction:column;gap:24px;
}
.drawer-section h3{font-size:15px;font-weight:650;margin-bottom:10px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
.fact{padding:10px 12px;border-radius:10px;background:var(--surface-2)}
.fact dt{color:var(--muted);font-size:12.5px;font-weight:550}
.fact dd{font-weight:650;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.timeline{
  display:flex;flex-direction:column;gap:0;border-left:2px solid var(--border);margin-left:5px;
}
.timeline li{position:relative;display:flex;flex-wrap:wrap;gap:4px 14px;padding:4px 0 10px 18px}
.timeline li::before{
  content:"";position:absolute;left:-7px;top:9px;width:12px;height:12px;border-radius:50%;
  background:var(--ok);box-shadow:0 0 0 3px var(--surface);
}
.timeline time{color:var(--muted);min-width:7.5em;font-variant-numeric:tabular-nums}

.tooltip{
  position:fixed;z-index:30;max-width:280px;padding:8px 11px;border-radius:9px;
  background:var(--text);color:var(--surface);font-size:13px;line-height:1.4;pointer-events:none;
  box-shadow:0 6px 18px rgba(0,0,0,.2);display:flex;flex-direction:column;
}
.tooltip strong{font-weight:650}
.day-title::first-letter,.session-day h3::first-letter,.tooltip strong::first-letter{
  text-transform:uppercase;
}
`;
