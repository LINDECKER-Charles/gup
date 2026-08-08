import type { PackageIds } from "../../core/install-source.js";

/**
 * JetBrains product code → package-manager ids, and → download-page slug.
 *
 * Split out of `jetbrains.ts` because this is data, not logic: it changes at
 * the pace of the JetBrains catalogue, not the provider's, and keeping it in
 * the same file drowned 200 lines of scanning under 120 lines of table.
 */

/**
 * JetBrains ships every IDE as a Homebrew *cask*, never a formula, so all the
 * macOS ids live under `brewCask` (`brew upgrade --cask <token>`). AQ (Aqua) has
 * no verified cask token and is deliberately left without one.
 */
const PACKAGE_IDS: Record<string, PackageIds> = {
  IU: {
    winget: "JetBrains.IntelliJIDEA.Ultimate",
    scoop: "intellij-idea-ultimate",
    choco: "intellijidea-ultimate",
    brewCask: "intellij-idea",
  },
  IC: {
    winget: "JetBrains.IntelliJIDEA.Community",
    scoop: "intellij-idea",
    choco: "intellijidea-community",
    brewCask: "intellij-idea-ce",
  },
  WS: {
    winget: "JetBrains.WebStorm",
    scoop: "webstorm",
    choco: "webstorm",
    brewCask: "webstorm",
  },
  PS: {
    winget: "JetBrains.PhpStorm",
    scoop: "phpstorm",
    choco: "phpstorm",
    brewCask: "phpstorm",
  },
  PY: {
    winget: "JetBrains.PyCharm.Professional",
    scoop: "pycharm-professional",
    choco: "pycharm",
    brewCask: "pycharm",
  },
  PCP: {
    winget: "JetBrains.PyCharm.Professional",
    scoop: "pycharm-professional",
    choco: "pycharm",
    brewCask: "pycharm",
  },
  PC: {
    winget: "JetBrains.PyCharm.Community",
    scoop: "pycharm",
    choco: "pycharm-community",
    brewCask: "pycharm-ce",
  },
  PCC: {
    winget: "JetBrains.PyCharm.Community",
    scoop: "pycharm",
    choco: "pycharm-community",
    brewCask: "pycharm-ce",
  },
  GO: {
    winget: "JetBrains.GoLand",
    scoop: "goland",
    choco: "goland",
    brewCask: "goland",
  },
  RD: {
    winget: "JetBrains.Rider",
    scoop: "rider",
    choco: "jetbrains-rider",
    brewCask: "rider",
  },
  DB: {
    winget: "JetBrains.DataGrip",
    scoop: "datagrip",
    choco: "datagrip",
    brewCask: "datagrip",
  },
  DG: {
    winget: "JetBrains.DataGrip",
    scoop: "datagrip",
    choco: "datagrip",
    brewCask: "datagrip",
  },
  RM: {
    winget: "JetBrains.RubyMine",
    scoop: "rubymine",
    choco: "rubymine",
    brewCask: "rubymine",
  },
  CL: {
    winget: "JetBrains.CLion",
    scoop: "clion",
    choco: "clion",
    brewCask: "clion",
  },
  AQ: { winget: "JetBrains.Aqua", scoop: "aqua" },
  RR: {
    winget: "JetBrains.RustRover",
    scoop: "rustrover",
    brewCask: "rustrover",
  },
};

/** URL segment of `https://www.jetbrains.com/<slug>/download/`. */
const PRODUCT_SLUGS: Record<string, string> = {
  IU: "idea",
  IC: "idea",
  WS: "webstorm",
  PS: "phpstorm",
  PY: "pycharm",
  PCP: "pycharm",
  PC: "pycharm",
  PCC: "pycharm",
  GO: "go",
  RD: "rider",
  DB: "datagrip",
  DG: "datagrip",
  RM: "ruby",
  CL: "clion",
  AQ: "aqua",
  RR: "rust",
};

/** Package-manager ids for a product code, `{}` when the product is unmapped. */
export function packageIdsFor(productCode: string): PackageIds {
  return PACKAGE_IDS[productCode] ?? {};
}

/** Download slug, falling back to `products` (the catalogue page). */
export function productSlug(productCode: string): string {
  return PRODUCT_SLUGS[productCode] ?? "products";
}
