import { describe, expect, it } from "vitest";
import { CONFIRM_UPDATE } from "../../../src/ui/text/menu-labels.js";
import {
  CONFIRM_EXTRA,
  ELEVATE_DIALOG,
  PANE_LABELS,
  STOP_DIALOG,
} from "../../../src/ui/text/run-labels.js";

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
