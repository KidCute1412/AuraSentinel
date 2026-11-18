import { Link, useLocation } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { useSession as useServerSession } from "@/shared/api";
import { isLive } from "@/shared/api/dataSource";
import { cn } from "@/shared/lib/cn";

/**
 * Admin link in the header, to the ops console at /admin. The role comes only from the server's SIWE session (A9:
 * allowlisted address), shared with LiveSessionSync through the query cache, so this adds no request. Mock mode has
 * no server and therefore no admin. The server's AdminGuard is the real gate; this only hides the link.
 */
export function AdminEntry({ live = isLive }: { live?: boolean }) {
  if (!live) return null;
  return <SessionAdminLink />;
}

function SessionAdminLink() {
  const { data } = useServerSession();
  const { pathname } = useLocation();
  if (data?.role !== "admin") return null;
  const here = pathname === "/admin";
  return (
    <Link
      to="/admin"
      aria-label="Admin console"
      aria-current={here ? "page" : undefined}
      className={cn(
        "inline-flex h-10 min-w-10 items-center justify-center gap-2 border border-line-strong px-2.5 font-mono text-xs font-bold uppercase tracking-widest hover:bg-hover sm:px-3",
        here ? "bg-ink text-bg hover:bg-ink" : "text-fg",
      )}
    >
      <Settings2 aria-hidden className="size-4" />
      <span aria-hidden className="hidden sm:inline">Admin</span>
    </Link>
  );
}
