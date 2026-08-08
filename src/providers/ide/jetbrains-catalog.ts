import type { PackageIds } from "../../core/install-source.js";

/**
 * Correspondances produit JetBrains → identifiants par gestionnaire de paquets
 * et → slug de la page de téléchargement.
 *
 * Séparé de `jetbrains.ts` parce que ce sont des données, pas de la logique :
 * elles changent au rythme du catalogue JetBrains, pas à celui du provider, et
 * les garder dans le même fichier y noyait les 200 lignes de scan sous 120
 * lignes de table.
 */

/**
 * JetBrains publie chaque IDE en *cask* Homebrew, jamais en formule, donc tous
 * les identifiants macOS vivent sous `brewCask` (`brew upgrade --cask <token>`).
 * AQ (Aqua) n'a pas de token de cask vérifié et reste délibérément sans.
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

/** Segment d'URL de `https://www.jetbrains.com/<slug>/download/`. */
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

/** Identifiants par PM pour un code produit, `{}` si le produit n'est pas mappé. */
export function packageIdsFor(productCode: string): PackageIds {
  return PACKAGE_IDS[productCode] ?? {};
}

/** Slug de téléchargement, `products` (la page catalogue) en repli. */
export function productSlug(productCode: string): string {
  return PRODUCT_SLUGS[productCode] ?? "products";
}
