import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { shortAddress } from "@/shared/lib/address";

interface Props {
  address: string;
  /** Show the full address (detail views) instead of the shortened form. */
  full?: boolean;
  className?: string;
}

/** Shortened address with a copy button. Full value stays available to assistive tech and on hover. */
export function AddressChip({ address, full, className }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable (insecure origin, permissions): fail silently, the text is selectable.
    }
  };

  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 border border-line bg-bg px-2 py-1 font-mono text-xs", className)}>
      <span title={address} className={cn(full ? "break-all" : "whitespace-nowrap")}>
        {full ? address : shortAddress(address)}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Address copied" : "Copy address"}
        className="inline-flex size-6 shrink-0 items-center justify-center text-muted hover:bg-hover hover:text-fg"
      >
        {copied ? <Check aria-hidden className="size-3.5 text-accent-text" /> : <Copy aria-hidden className="size-3.5" />}
      </button>
      <span role="status" className="sr-only">{copied ? "Copied" : ""}</span>
    </span>
  );
}
