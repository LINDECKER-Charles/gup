import { localized } from "../../core/i18n/localized.js";

/**
 * Why Homebrew refused to build a formula, and the fix, as a manual action.
 *
 * A formula with no bottle for this Mac installs from source — a tap's binary
 * formula such as `symfony-cli/tap/symfony-cli`, which has no bottle at all,
 * or any formula on a macOS too new for its bottles — and Homebrew checks the
 * build tools before it starts (`fatal_build_from_source_checks`, in
 * Homebrew's `extend/os/mac/diagnostic.rb`): Command Line Tools or Xcode too
 * old for this macOS, missing, or the Xcode license not accepted. The bottled
 * formulae of the same batch upgrade fine, so only some rows fail. gup cannot
 * fix the tools and every retry would fail the same way: the update ends as
 * a skip that says what to do.
 */

/** Homebrew's own way out when Software Update offers nothing. */
const CLT_REINSTALL =
  "sudo rm -rf /Library/Developer/CommandLineTools && sudo xcode-select --install";

/** What the user reads, in the interface's languages: why Homebrew stopped, then the fix. */
const TEXT = localized({
  en: {
    blocked: (reason: string, fix: string) =>
      `Homebrew must build it from source, and ${reason}: ${fix}`,
    cltUnsupported: (macos: string) => `your Command Line Tools do not support macOS ${macos}`,
    cltOutdated: "your Command Line Tools are too old",
    cltUpdate:
      "update them from Software Update in System Settings, " +
      `or reinstall them: ${CLT_REINSTALL}`,
    xcodeOutdated: "your Xcode is too old for this macOS",
    xcodeUpdate: "update it from the App Store",
    cltMissing: "the Command Line Tools are not installed",
    cltInstall: "run xcode-select --install",
    licenseRefused: "the Xcode license is not accepted",
    licenseAccept: "run sudo xcodebuild -license",
  },
  fr: {
    blocked: (reason, fix) => `Homebrew doit le compiler depuis les sources, et ${reason} : ${fix}`,
    cltUnsupported: (macos) => `les Command Line Tools ne prennent pas en charge macOS ${macos}`,
    cltOutdated: "les Command Line Tools sont trop anciens",
    cltUpdate:
      "les mettre à jour depuis Mise à jour de logiciels dans Réglages Système, " +
      `ou les réinstaller : ${CLT_REINSTALL}`,
    xcodeOutdated: "Xcode est trop ancien pour ce macOS",
    xcodeUpdate: "le mettre à jour depuis l'App Store",
    cltMissing: "les Command Line Tools ne sont pas installés",
    cltInstall: "lancer xcode-select --install",
    licenseRefused: "la licence Xcode n'est pas acceptée",
    licenseAccept: "lancer sudo xcodebuild -license",
  },
});

/** What a block says to do, built when it happens: in the language of the moment. */
type BlockMessage = (match: RegExpMatchArray) => string;

const BUILD_TOOLS_BLOCKS: ReadonlyArray<readonly [RegExp, BlockMessage]> = [
  // A major macOS upgrade left the Command Line Tools without its SDK.
  [
    /Your Command Line Tools \(CLT\) does not support macOS (\d+)/,
    (match) => TEXT.blocked(TEXT.cltUnsupported(match[1] ?? ""), TEXT.cltUpdate),
  ],
  [
    /Your Command Line Tools are too outdated/,
    () => TEXT.blocked(TEXT.cltOutdated, TEXT.cltUpdate),
  ],
  // `Your Xcode (16.4) at /Applications/Xcode.app is too outdated.`,
  // `Your Xcode does not support macOS 27.`
  [
    /Your Xcode (?:\([^)]*\) at \S+ is too outdated|does not support macOS)/,
    () => TEXT.blocked(TEXT.xcodeOutdated, TEXT.xcodeUpdate),
  ],
  [
    /No developer tools installed|Xcode alone is not sufficient/,
    () => TEXT.blocked(TEXT.cltMissing, TEXT.cltInstall),
  ],
  [
    /You have not agreed to the Xcode license/,
    () => TEXT.blocked(TEXT.licenseRefused, TEXT.licenseAccept),
  ],
];

/**
 * The manual action a failed `brew upgrade` calls for, when its output says
 * the build tools stopped it; undefined for any other failure, or when no
 * sink kept the output.
 *
 * The embedded terminal hands its output back as screen rows, and a pane
 * narrower than Homebrew's line cuts it anywhere — in a word, or at a space
 * the row then drops. The patterns are matched on the rows joined back both
 * ways, which also leaves Homebrew's own lines one after the other.
 */
export function buildToolsBlock(output: string | undefined): string | undefined {
  if (output === undefined) return undefined;
  const rows = output.split(/\r\n|\r|\n/);
  const texts = [rows.join(""), rows.join(" ")];
  for (const [pattern, message] of BUILD_TOOLS_BLOCKS) {
    const match = texts.map((text) => text.match(pattern)).find((found) => found !== null);
    if (match) return message(match);
  }
  return undefined;
}
