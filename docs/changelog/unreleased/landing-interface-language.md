# landing-interface-language

## Fixed

- **landing:** The site no longer says gup's interface is French. The terminal caption and the
  FAQ say, in the eight languages, that it is English by default and French with
  `gup language fr`, which saves the choice, or with `GUP_LANG=fr`, which applies to a single
  shell and takes precedence; the caption renders its command as code. `llms.txt` and
  `llms-full.txt` give the English sidebar (Scan · Packages · Schedules, then Providers ·
  Journal · Options, then Quit), the same two ways to French, and `GUP_LANG` among the
  environment variables
  (`fix(landing): say the interface is English by default, French on demand`)

## Internal

- **landing:** The terminal demo's drift detector reads a sidebar label that a view defines as a
  getter (`get label() { return …; }`), as Schedules has done since its texts were localized:
  the site's tests failed on it (`test(landing): read a view's sidebar label from its getter`)
