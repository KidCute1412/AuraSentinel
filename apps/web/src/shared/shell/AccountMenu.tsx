import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, LayoutGrid, LogOut } from "lucide-react";
import type { Wallet } from "@/shared/session/sessionStore";
import { useSignOut } from "@/shared/session/useSignOut";
import { shortAddress } from "@/shared/lib/address";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { DropdownMenu, menuItemClass } from "@/shared/ui/DropdownMenu";

/**
 * Signed-in control: the address opens a menu (my vaults, sign out). Sign out asks first.
 * Its own component so the providers behind useSignOut (query, wagmi) are only needed once someone is signed in.
 */
export function AccountMenu({ wallet }: { wallet: Wallet }) {
  const signOut = useSignOut();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DropdownMenu
        label={`Account ${wallet.address}`}
        triggerClassName="inline-flex h-10 items-center gap-2 border border-line-strong px-3 font-mono text-xs font-bold text-fg hover:bg-hover"
        trigger={
          <>
            <span aria-hidden className="size-1.5 shrink-0 bg-ok" />
            {shortAddress(wallet.address)}
            <ChevronDown aria-hidden className="size-4" />
          </>
        }
      >
        {(close) => (
          <>
            <div className="border-b border-line px-4 py-3">
              <span className="mono-label block">SIGNED IN</span>
              <span className="mt-1 block break-all font-mono text-xs text-soft">{wallet.address}</span>
            </div>
            <Link to="/vaults" role="menuitem" onClick={() => close(false)} className={menuItemClass}>
              <LayoutGrid aria-hidden className="size-4 shrink-0 text-accent-text" />
              My vaults
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                setConfirming(true);
              }}
              className={`${menuItemClass} border-t border-line`}
            >
              <LogOut aria-hidden className="size-4 shrink-0 text-muted" />
              Sign out
            </button>
          </>
        )}
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        title="Sign out?"
        body="This ends your session on this device and disconnects your wallet from AgentShield. Your funds and vaults are not affected. You can sign in again any time."
        confirmLabel="Sign out"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          signOut();
        }}
      />
    </>
  );
}
