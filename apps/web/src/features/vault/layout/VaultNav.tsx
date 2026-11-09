import { NavLink } from "react-router-dom";
import { cn } from "@/shared/lib/cn";
import { SECTION_LABEL, sectionPath, visibleSections, type VaultRole } from "../guards/access";

/** Sub-nav of a vault. Active tab = 2px accent underline (design-system §3 sub-nav). Scrolls sideways on phones. */
export function VaultNav({ safe, role }: { safe: string; role: VaultRole }) {
  return (
    <nav aria-label="Vault sections" className="-mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {visibleSections(role).map((s) => (
          <li key={s}>
            <NavLink
              to={sectionPath(safe, s)}
              end={s === "overview" || s === "activity"}
              className={({ isActive }) =>
                cn(
                  "inline-flex min-h-11 items-center border-b-2 px-4 font-mono text-xs font-bold uppercase tracking-widest",
                  isActive ? "border-accent text-fg" : "border-transparent text-muted hover:bg-hover hover:text-fg",
                )
              }
            >
              {SECTION_LABEL[s]}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
