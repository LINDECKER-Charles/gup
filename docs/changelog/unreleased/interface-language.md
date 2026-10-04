# interface-language

## Documentation

- **guide:** The README and the user guides describe the interface gup now speaks by default:
  every label, key hint, message and dialog they quote is the English text, with the French one
  beside it only where a French user needs it to find a control (the sidebar, BEHAVIOR/CONFORT),
  and the screenshots' alt texts name the English views. They also document the language itself:
  choosing French at install by chaining `&& gup language fr` (Windows PowerShell 5.1 runs the
  two commands one after the other), `gup language [code]` and its exit codes, `GUP_LANG` and its
  precedence over the `interface.language` setting, the Options › Language row, what follows the
  language — the help, dates and numbers, the HTML report — and what does not, JSON and CSV
  fields; troubleshooting gains an entry for a language that does not apply, and the CLI reference
  no longer says the output is French (`docs(guide): describe the English interface and gup language`)
- **guide:** Updating gup itself says what changes on Windows: a running gup keeps OpenTUI's
  renderer and node-pty's ConPTY loaded, and Windows does not replace a loaded DLL, so gup leaves
  its own update for after it exits — its row in Packages cannot be checked,
  `gup update npm-g:@charles_lindecker/gup` ends as a skip, and the app prints
  `npm install -g @charles_lindecker/gup@latest --allow-scripts=node-pty` as it quits; the
  interactive app guide, the CLI reference and troubleshooting say so where a user meets it, and
  macOS and Linux keep updating gup like any package (`docs(guide): say how gup updates itself on
  Windows`)
