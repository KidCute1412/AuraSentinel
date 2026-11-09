import { KillSwitch } from "./KillSwitch";

/**
 * Phone-only bar pinned to the bottom so the Kill-Switch is always one hold away (ui-pages §4.1).
 * Desktop shows the full Kill-Switch block in the page instead.
 */
export function KillDock({ safe, onKilled }: { safe: string; onKilled?: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-danger bg-bg px-4 py-3 lg:hidden" role="region" aria-label="Kill-Switch dock">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 pr-24 sm:pr-0">
        <span className="mono-label hidden !text-danger-text sm:inline">Emergency</span>
        <KillSwitch safe={safe} isActive size="compact" onKilled={onKilled} />
      </div>
    </div>
  );
}
