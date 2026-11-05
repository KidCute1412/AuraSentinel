const base =
  "chamfer inline-flex h-12 items-center justify-center rounded-none px-7 text-base font-bold transition-transform duration-150";

// Hard shadow comes from a `drop-hard` wrapper (clip-path would clip box-shadow).
export const primaryCta = `${base} bg-accent text-bg hover:-translate-x-px hover:-translate-y-px active:translate-x-0 active:translate-y-0`;
export const secondaryCta = `${base} bg-hover text-fg hover:bg-line`;
