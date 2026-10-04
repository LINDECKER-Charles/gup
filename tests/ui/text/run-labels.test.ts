import { describe, expect, it } from "vitest";
import { CONFIRM_UPDATE } from "../../../src/ui/text/menu-labels.js";
import {
  CONFIRM_EXTRA,
  ELEVATE_DIALOG,
  PANE_LABELS,
  STOP_DIALOG,
} from "../../../src/ui/text/run-labels.js";
import { useLocale } from "../../support/locale.js";

describe("update messages that depend on a count", () => {
  it("agree with one package as with several", () => {
    expect(CONFIRM_UPDATE.heading(1)).toBe("1 paquet va être mis à jour :");
    expect(CONFIRM_UPDATE.heading(3)).toBe("3 paquets vont être mis à jour :");
    expect(ELEVATE_DIALOG.text.uac(1)).toBe(
      "1 paquet nécessite les droits administrateur. Ouvrir une invite UAC pour le traiter ?",
    );
    expect(ELEVATE_DIALOG.text.sudo(2)).toBe(
      "2 paquets nécessitent les droits administrateur : sudo demandera votre mot de passe " +
        "dans le terminal. Les traiter en bloc ?",
    );
    expect(CONFIRM_EXTRA.admin.uac(1)).toMatch(/^1 paquet nécessite /);
    expect(PANE_LABELS.adminElsewhere(2)).toMatch(/^2 paquets s'installent /);
  });

  it("name what a stop cancels, the last package included", () => {
    expect(STOP_DIALOG.text(0)).toBe("Le paquet en cours est interrompu.");
    expect(STOP_DIALOG.text(1)).toBe(
      "Le paquet en cours est interrompu et le paquet restant est annulé.",
    );
    expect(STOP_DIALOG.text(4)).toBe(
      "Le paquet en cours est interrompu et les 4 paquets restants sont annulés.",
    );
  });
});

describe("update messages that depend on a count, in English", () => {
  useLocale("en");

  it("agree with one package as with several", () => {
    expect(CONFIRM_UPDATE.heading(1)).toBe("1 package will be updated:");
    expect(CONFIRM_UPDATE.heading(3)).toBe("3 packages will be updated:");
    expect(CONFIRM_UPDATE.more(4)).toBe("… and 4 more");
    expect(ELEVATE_DIALOG.text.uac(1)).toBe(
      "1 package needs administrator rights. Open a UAC prompt to handle it?",
    );
    expect(ELEVATE_DIALOG.text.sudo(2)).toBe(
      "2 packages need administrator rights: sudo will ask for your password in the " +
        "terminal. Handle them in one batch?",
    );
    expect(PANE_LABELS.adminElsewhere(1)).toMatch(/^1 package installs /);
    expect(PANE_LABELS.adminElsewhere(2)).toMatch(/^2 packages install /);
  });

  it("name what a stop cancels, the last package included", () => {
    expect(STOP_DIALOG.text(0)).toBe("The current package is interrupted.");
    expect(STOP_DIALOG.text(1)).toBe(
      "The current package is interrupted and the remaining package is cancelled.",
    );
    expect(STOP_DIALOG.text(4)).toBe(
      "The current package is interrupted and the 4 remaining packages are cancelled.",
    );
  });
});
