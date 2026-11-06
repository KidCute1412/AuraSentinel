import { cn } from "@/shared/lib/cn";

interface GateDoorProps {
  /** 0..3 finished steps. The vault door opens one notch per step. */
  stage: 0 | 1 | 2 | 3;
  denied?: boolean;
  className?: string;
}

const BOLTS = [58, 160, 262];

/** Blueprint vault door. Wheel turns, bolts retract and the shackle lifts as the sign-in progresses. */
export function GateDoor({ stage, denied, className }: GateDoorProps) {
  const open = stage === 3;
  const lampTone = (i: number) => (i < stage ? "var(--accent)" : denied && i === stage ? "var(--danger)" : "var(--line)");
  return (
    <svg viewBox="0 0 320 326" role="img" aria-label={`Vault door, ${stage} of 3 steps done`} className={cn("block w-full", className)}>
      {/* dimension lines */}
      <g stroke="var(--line-strong)" strokeWidth="1" fill="none">
        <path d="M20 14H300M20 9V19M300 9V19" />
        <path d="M312 20V300M307 20H317M307 300H317" />
      </g>
      <text x="160" y="11" textAnchor="middle" className="fill-muted font-mono" fontSize="8" letterSpacing="2">GATE-01 · 2400 MM</text>

      {/* frame */}
      <polygon points="26,30 280,30 296,46 296,296 40,296 24,280" fill="var(--surface)" stroke="var(--shadow-color)" strokeWidth="3" strokeLinejoin="miter" />
      <polygon points="40,44 272,44 282,54 282,282 50,282 40,272" fill="none" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 4" />

      {/* bolts: slide out of the frame when open */}
      {BOLTS.map((y) => (
        <rect
          key={y}
          x="22"
          y={y - 9 + 6}
          width="28"
          height="18"
          fill="var(--hover)"
          stroke="var(--shadow-color)"
          strokeWidth="2.5"
          className="gate-move"
          style={{ transform: `translateX(${stage >= 2 ? -20 : stage === 1 ? -8 : 0}px)` }}
        />
      ))}

      {/* wheel */}
      <g className="gate-move" style={{ transform: `rotate(${stage * 120}deg)`, transformOrigin: "160px 162px" }}>
        <circle cx="160" cy="162" r="84" fill="var(--bg)" stroke="var(--shadow-color)" strokeWidth="3" />
        <circle cx="160" cy="162" r="68" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="2 6" />
        {[0, 60, 120].map((deg) => (
          <rect key={deg} x="154" y="82" width="12" height="160" fill="var(--hover)" stroke="var(--shadow-color)" strokeWidth="2.5" transform={`rotate(${deg} 160 162)`} />
        ))}
      </g>

      {/* lock */}
      <g>
        <path
          d="M142 150V134a18 18 0 0 1 36 0V150"
          fill="none"
          stroke="var(--shadow-color)"
          strokeWidth="8"
          strokeLinecap="butt"
          className="gate-move"
          style={{ transform: open ? "translateY(-12px)" : "none", transformOrigin: "142px 150px" }}
        />
        <rect x="132" y="148" width="56" height="44" fill={open ? "var(--accent)" : denied ? "var(--danger)" : "var(--highlight)"} stroke="var(--shadow-color)" strokeWidth="3" className="gate-move" />
        {denied ? (
          <path d="M152 160l16 20M168 160l-16 20" stroke="var(--on-accent)" strokeWidth="4" fill="none" />
        ) : open ? (
          <path d="M150 170l8 8 14-16" stroke="var(--on-accent)" strokeWidth="4" fill="none" />
        ) : (
          <>
            <circle cx="160" cy="166" r="5" fill="var(--on-accent)" />
            <rect x="158" y="168" width="4" height="12" fill="var(--on-accent)" />
          </>
        )}
      </g>

      {/* lamps */}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={118 + i * 34} y="262" width="26" height="10" fill={lampTone(i)} stroke="var(--shadow-color)" strokeWidth="2" className="gate-move" />
      ))}
      <text x="160" y="316" textAnchor="middle" className="fill-muted font-mono" fontSize="8" letterSpacing="2">
        {open ? "ACCESS GRANTED" : denied ? "SIGNATURE REFUSED" : `STAGE ${Math.min(stage + 1, 3)} / 3`}
      </text>
    </svg>
  );
}
