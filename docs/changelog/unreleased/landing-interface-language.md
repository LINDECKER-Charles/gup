# landing-interface-language

## Internal

- **landing:** The terminal demo's drift detector reads a sidebar label that a view defines as a
  getter (`get label() { return …; }`), as Schedules has done since its texts were localized:
  the site's tests failed on it (`test(landing): read a view's sidebar label from its getter`)
