import { useLocation } from "react-router-dom";
import { useSession as useServerSession } from "@/shared/api";
import { isLive } from "@/shared/api/dataSource";
import { AdminDrawer } from "./AdminDrawer";

/** The drawer belongs to the dashboard (ui-pages.md §7): /demo and every /vaults page. */
export const isDashboardPath = (pathname: string): boolean => /^\/(demo|vaults)(\/|$)/.test(pathname);

/**
 * Admin button in the app bar (D16). The role comes only from the server's SIWE session (A9: allowlisted
 * address), shared with LiveSessionSync through the query cache, so this adds no request. Mock mode has no
 * server and therefore no admin.
 */
export function AdminEntry({ live = isLive }: { live?: boolean }) {
  const { pathname } = useLocation();
  if (!live || !isDashboardPath(pathname)) return null;
  return <SessionAdminDrawer />;
}

function SessionAdminDrawer() {
  const { data } = useServerSession();
  return <AdminDrawer role={data?.role} />;
}
