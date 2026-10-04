/**
 * The install command the site shows, read from the README: the first line of
 * the fenced block right under its `## Install` heading, verbatim, flags
 * included.
 *
 * The README is where the command is maintained, and the docs repeat it from
 * there. Reading it rather than rebuilding it from the package name keeps the
 * landing on the exact same line: `--allow-scripts=node-pty` reached the README
 * when npm 11 and 12 started asking before running install scripts, while the
 * site, which composed `npm install -g <name>` itself, kept showing the bare
 * command.
 */
const INSTALL_BLOCK = /^## Install[ \t]*\r?\n(?:[ \t]*\r?\n)*```[\w-]*\r?\n(?<line>[^\r\n]*)/m;

/**
 * @param {string} readme       The README's text.
 * @param {string} packageName  The root package.json `name`.
 * @returns {string}            The command, e.g. `npm install -g <name> --flag`.
 */
export function readInstallCommand(readme, packageName) {
  const command = INSTALL_BLOCK.exec(readme)?.groups.line.trim();
  if (!command) {
    throw new Error("read-install-command: no command in a fenced block under `## Install`");
  }
  // The package itself, not one whose name merely starts with it.
  const install = `npm install -g ${packageName}`;
  if (command !== install && !command.startsWith(`${install} `)) {
    throw new Error(`read-install-command: \`${command}\` does not start with \`${install}\``);
  }
  return command;
}
