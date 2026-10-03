/**
 * How the report adapts: narrow screens (stacked header, fewer table
 * columns, the drawer's actions above its title), reduced motion, forced
 * colours (Windows high contrast: marks keep their patterns, outlines
 * replace backgrounds) and print (every page one after the other, light,
 * without the controls nor the optional columns, cards kept whole).
 */
export const ADAPTIVE_CSS = String.raw`
@media (max-width:760px){
.masthead{position:static}
.masthead-inner{padding:14px 16px 8px}
.tools{width:100%}
.search-box{flex:1 1 100%}
.search-box input{width:100%}
.chart-frame{overflow-x:auto}
.chart-svg{min-width:520px}
.packages{min-width:620px}
.packages tbody th{min-width:9em}
.control{flex:1 1 160px}
.control select{min-width:0;width:100%}
main{padding:18px 14px 8px}
.hero{grid-template-columns:1fr;padding:20px}
.hero-number{font-size:48px}
.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
.optional{display:none}
.top-item{grid-template-columns:minmax(0,1fr) auto}
.top-item .meter{display:none}
.drawer-head,.drawer-body{padding-left:16px;padding-right:16px}
.drawer-head{flex-wrap:wrap}
.drawer-actions{order:-1;width:100%;justify-content:flex-end}
}
@media (prefers-reduced-motion:reduce){
*,*::before,*::after{
  animation:none !important;transition:none !important;scroll-behavior:auto !important;
}
}
@media (forced-colors:active){
.cell{forced-color-adjust:none;border:1px solid CanvasText}
.cell[data-level="0"]{border-color:GrayText}
.pill,.badge,.chip,.nav-count{border:1px solid CanvasText}
.tabs a[aria-current="page"]{border-bottom-color:Highlight}
}
@media print{
body{background:#fff;font-size:12px}
.masthead{position:static;border-bottom:0}
.tools,.tabs,.skip-link,.chart-actions,.more-slot,.toolbar,.search-note,.day-filter,.card-link,
.banner:empty,.drawer,.tooltip,.day-detail,.card-actions,.failure-open,.optional{
  display:none !important;
}
.session summary::after{display:none}
[data-page-section][hidden]{display:block !important}
.page{break-before:page}
.page:first-of-type{break-before:auto}
.card,.hero,.kpi,.failure-card,.session-day,.drawer-section{break-inside:avoid;box-shadow:none}
.table-wrap{overflow:visible}
thead th{position:static}
.heat-scroll{overflow:visible}
a{color:inherit;text-decoration:none}
.footer{margin-bottom:0}
}
`;
