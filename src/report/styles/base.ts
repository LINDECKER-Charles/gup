/**
 * The report's page frame: reset, system typography, the header (brand,
 * period, search, theme switch, print), the section tabs, page headings,
 * buttons and form controls, focus rings, the banner and the footer.
 */
export const BASE_CSS = String.raw`
*,*::before,*::after{box-sizing:border-box}
html{
  -webkit-text-size-adjust:100%;text-size-adjust:100%;
  scroll-padding-top:calc(var(--masthead-height,0px) + 12px);
}
body{
  margin:0;background:var(--bg);color:var(--text);
  font:400 15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
h1,h2,h3,p,ul,ol,dl,dd,figure,pre{margin:0}
ul,ol{padding:0;list-style:none}
button,input,select{font:inherit;color:inherit}
pre,code,kbd{font-family:ui-monospace,"Cascadia Mono","SF Mono",Menlo,Consolas,monospace}
a{color:var(--accent);text-underline-offset:2px}
a:hover{text-decoration-thickness:2px}
[hidden]{display:none !important}
.sr-only{
  position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);
  white-space:nowrap;border:0;
}
.muted{color:var(--muted)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
[tabindex="-1"]:focus:not(:focus-visible){outline:none}

.skip-link{
  position:absolute;left:16px;top:-48px;z-index:20;padding:8px 14px;border-radius:8px;
  background:var(--accent);color:var(--on-accent);font-weight:600;text-decoration:none;
}
.skip-link:focus{top:12px}

.masthead{
  background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:10;
}
.masthead-inner{
  max-width:1180px;margin:0 auto;padding:18px 24px 10px;display:flex;flex-wrap:wrap;
  align-items:center;justify-content:space-between;gap:16px 24px;
}
.brand{display:flex;align-items:center;gap:14px;min-width:0}
.brand-mark{
  display:inline-grid;place-items:center;width:42px;height:42px;border-radius:12px;
  background:var(--accent);color:var(--on-accent);font-weight:700;font-size:15px;
  letter-spacing:.02em;
}
.brand-text h1{font-size:20px;line-height:1.25;font-weight:650;letter-spacing:-.01em}
.period{color:var(--muted);font-size:14px}
.tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px}

.search-box{position:relative;display:flex;align-items:center}
.search-box input{
  width:min(400px,70vw);height:38px;padding:0 38px 0 12px;border:1px solid var(--border-strong);
  border-radius:10px;background:var(--surface);color:var(--text);
}
.search-box input::placeholder{color:var(--muted);opacity:1}
.search-box input:focus-visible{outline-offset:0;border-color:var(--accent)}
.search-box kbd{
  position:absolute;right:9px;min-width:22px;padding:1px 6px;border:1px solid var(--border);
  border-radius:6px;background:var(--surface-2);color:var(--muted);font-size:12px;text-align:center;
  pointer-events:none;
}

.theme-switch{
  display:inline-flex;padding:3px;border:1px solid var(--border-strong);border-radius:10px;
  background:var(--surface-2);
}
.theme-switch button{
  border:0;background:transparent;padding:5px 11px;border-radius:7px;color:var(--muted);
  font-size:13.5px;font-weight:550;cursor:pointer;
}
.theme-switch button:hover{color:var(--text)}
.theme-switch button[aria-pressed="true"]{
  background:var(--surface);color:var(--text);box-shadow:var(--shadow);
}

.button{
  display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 14px;
  border:1px solid var(--border-strong);border-radius:10px;background:var(--surface);
  color:var(--text);font-size:14px;font-weight:550;cursor:pointer;text-decoration:none;
  white-space:nowrap;
}
.button:hover{background:var(--surface-hover)}
.button.more{margin:16px auto 0;display:flex}
.icon-button{
  display:inline-grid;place-items:center;width:38px;height:38px;
  border:1px solid var(--border-strong);border-radius:10px;background:var(--surface);font-size:22px;
  line-height:1;cursor:pointer;
}
.icon-button:hover{background:var(--surface-hover)}
.link-button{
  border:0;background:none;padding:2px 0;color:var(--accent);font-size:14px;font-weight:550;
  cursor:pointer;text-decoration:underline;text-underline-offset:2px;
}

.tabs{max-width:1180px;margin:0 auto;padding:0 16px;overflow-x:auto;scrollbar-width:thin}
.tabs ul{display:flex;gap:4px}
.tabs a{
  display:inline-flex;align-items:center;gap:8px;padding:10px 12px 11px;color:var(--muted);
  font-weight:550;text-decoration:none;white-space:nowrap;border-bottom:2px solid transparent;
}
.tabs a:hover{color:var(--text)}
.tabs a[aria-current="page"]{color:var(--text);border-bottom-color:var(--accent)}
.nav-count{
  min-width:22px;padding:0 7px;border-radius:999px;background:var(--surface-2);color:var(--muted);
  font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;text-align:center;
}
.nav-count:empty{display:none}
.tabs a[aria-current="page"] .nav-count{background:var(--accent-weak);color:var(--accent)}

.banner{
  max-width:1180px;margin:16px auto 0;padding:12px 16px;border:1px solid var(--skip);
  border-left-width:4px;border-radius:10px;background:var(--skip-weak);color:var(--text);
}
main{max-width:1180px;margin:0 auto;padding:24px 24px 8px}
main:focus{outline:none}
.page-head{margin:4px 0 20px}
.page-head h2{font-size:26px;line-height:1.2;font-weight:650;letter-spacing:-.015em}
.page-lead{margin-top:4px;color:var(--muted)}
.page-body{display:flex;flex-direction:column;gap:20px}
.page-intro{
  display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;
  color:var(--muted);
}

.toolbar{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px 16px}
.control{
  display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted);font-weight:550;
}
.control select{
  height:38px;min-width:190px;padding:0 10px;border:1px solid var(--border-strong);
  border-radius:10px;background:var(--surface);color:var(--text);font-size:14px;
}
.result-count{margin-left:auto;color:var(--muted);font-size:14px;font-variant-numeric:tabular-nums}
.search-note,.day-filter{
  display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;
  background:var(--accent-weak);color:var(--text);
}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{
  height:34px;padding:0 13px;border:1px solid var(--border-strong);border-radius:999px;
  background:var(--surface);color:var(--muted);font-size:14px;font-weight:550;cursor:pointer;
}
.chip[aria-pressed="true"]{
  background:var(--accent-weak);border-color:var(--accent);color:var(--text);
}

.footer{
  max-width:1180px;margin:24px auto 40px;padding:20px 24px 0;border-top:1px solid var(--border);
  color:var(--muted);font-size:13.5px;display:flex;flex-direction:column;gap:6px;
}
.help summary{cursor:pointer;color:var(--text);font-weight:550;width:max-content}
.help ul{
  margin-top:8px;padding-left:18px;list-style:disc;display:flex;flex-direction:column;gap:4px;
}
.noscript{
  max-width:640px;margin:48px auto;padding:20px;border:1px solid var(--border);border-radius:12px;
  background:var(--surface);
}
`;
