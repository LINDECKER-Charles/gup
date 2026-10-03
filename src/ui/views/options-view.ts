import type { ViewDefinition } from "../app/view-definition.js";
import type { SectionFactory } from "../panels/options/option-row.js";
import { appearanceSection } from "../panels/options/appearance-section.js";
import { comfortSection } from "../panels/options/comfort-section.js";
import { fileSection } from "../panels/options/file-section.js";
import { createOptionsHost, isPreviewShown } from "../panels/options/options-host.js";
import { OptionsPanel } from "../panels/options/options-panel.js";
import { scanSection } from "../panels/options/scan-section.js";
import { settingsService, type SettingsService } from "../settings/settings-service.js";
import { scanModeFact, VIEW_LABELS } from "../text/menu-labels.js";
import { PREVIEW_FACT } from "../text/theme-labels.js";

export interface OptionsViewPorts {
  /** The settings shown and edited; default: the process-wide service. */
  readonly settings?: () => SettingsService;
  /**
   * Sections another feature adds (journal settings), in this order, between
   * the comfort settings and the file section.
   */
  readonly extraSections?: readonly SectionFactory[];
}

/**
 * Options: scan and install settings, the theme (with a live preview), its
 * colours, the comfort settings, and the settings file — each saved as soon
 * as it changes.
 */
export function optionsView(ports: OptionsViewPorts = {}): ViewDefinition {
  const sections: readonly SectionFactory[] = [
    scanSection,
    appearanceSection,
    comfortSection,
    ...(ports.extraSections ?? []),
    fileSection,
  ];
  return {
    id: "options",
    label: VIEW_LABELS.options,
    order: 60,
    group: 1,
    create: (context) => {
      const settings = (ports.settings ?? settingsService)();
      return new OptionsPanel(sections, createOptionsHost(context, { settings }));
    },
    facts: ({ state, screen }) => [
      scanModeFact(state.fast, state.filter.length),
      ...(isPreviewShown(screen.appearance) ? [PREVIEW_FACT] : []),
    ],
  };
}
