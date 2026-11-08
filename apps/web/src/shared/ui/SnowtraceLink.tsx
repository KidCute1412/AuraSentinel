import { ExternalLink } from "lucide-react";
import { explorerAddressUrl, explorerTxUrl } from "@agentshield/shared";
import { cn } from "@/shared/lib/cn";

interface Props {
  kind: "tx" | "address";
  value: string;
  children?: string;
  className?: string;
}

/** Link to Snowtrace (Fuji). Always opens in a new tab without leaking the opener. */
export function SnowtraceLink({ kind, value, children, className }: Props) {
  const href = kind === "tx" ? explorerTxUrl(value) : explorerAddressUrl(value);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1 font-mono text-xs font-bold uppercase tracking-wider text-accent-text underline-offset-4 hover:underline", className)}
    >
      {children ?? "Snowtrace"}
      <ExternalLink aria-hidden className="size-3" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
