# open-form-in-browser

## Fixed

- **core:** on Windows, the Feedback view's form opens in the browser again, instead of the
  Documents folder. gup handed the address to `explorer.exe` unquoted, and explorer splits an
  unquoted argument on `,` and `=`: the form's query string (`?install=…&version=…`) cut it
  short. The runner now writes every token of a detached launch quoted whole, the program's
  own path included (`windowsVerbatimArguments`), and refuses one it cannot quote — a `"`, or
  a final `\`. An HTML report whose folder name holds a comma opens too, where gup printed its
  path (`fix(core): quote explorer's argument so a URL query opens the browser`)

## Documentation

- **docs:** the report guide, its troubleshooting table and the HTML report design no longer
  say a path holding a comma is printed instead of opened
  (`docs: drop the comma refusal from the report guides`)
