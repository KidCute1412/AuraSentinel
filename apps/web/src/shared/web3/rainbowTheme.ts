import type { Theme } from "@rainbow-me/rainbowkit";

/**
 * RainbowKit theme mapped onto the Sentinel Terminal tokens (docs/product/design-system.md).
 * Every color is a `var(--token)` from styles/index.css, so the wallet modal follows
 * Carbon Paper (dark) and Day Blueprint (light) without a second theme. Square corners, hard shadows.
 */
const mix = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;

export const sentinelTheme: Theme = {
  blurs: { modalOverlay: "none" },
  fonts: { body: '"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif' },
  radii: {
    actionButton: "0",
    connectButton: "0",
    menuButton: "0",
    modal: "0",
    modalMobile: "0",
  },
  colors: {
    accentColor: "var(--accent)",
    accentColorForeground: "var(--on-accent)",
    actionButtonBorder: "var(--line)",
    actionButtonBorderMobile: "var(--line-strong)",
    actionButtonSecondaryBackground: "var(--hover)",
    closeButton: "var(--soft)",
    closeButtonBackground: "var(--hover)",
    connectButtonBackground: "var(--surface)",
    connectButtonBackgroundError: "var(--danger)",
    connectButtonInnerBackground: "var(--hover)",
    connectButtonText: "var(--fg)",
    connectButtonTextError: "var(--fg)",
    connectionIndicator: "var(--ok)",
    downloadBottomCardBackground: "var(--surface)",
    downloadTopCardBackground: "var(--hover)",
    error: "var(--danger-text)",
    generalBorder: "var(--line)",
    generalBorderDim: "var(--line)",
    menuItemBackground: "var(--hover)",
    modalBackdrop: mix("--bg", 80),
    modalBackground: "var(--surface)",
    modalBorder: "var(--line-strong)",
    modalText: "var(--fg)",
    modalTextDim: "var(--muted)",
    modalTextSecondary: "var(--soft)",
    profileAction: "var(--hover)",
    profileActionHover: "var(--line)",
    profileForeground: "var(--bg)",
    selectedOptionBorder: "var(--accent)",
    standby: "var(--highlight)",
  },
  shadows: {
    connectButton: "3px 3px 0 var(--shadow-color)",
    dialog: "5px 5px 0 var(--shadow-color)",
    profileDetailsAction: "none",
    selectedOption: "3px 3px 0 var(--shadow-color)",
    selectedWallet: "3px 3px 0 var(--shadow-color)",
    walletLogo: "none",
  },
};
