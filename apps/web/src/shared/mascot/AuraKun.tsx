import type { Mood } from "./mascotStore";

interface AuraKunProps {
  mood: Mood;
  shades?: boolean;
  blinking?: boolean;
  className?: string;
}

const ARMS_UP: Mood[] = ["happy", "hop", "guard", "hug", "whoa", "cheer", "spin"];
const CLOSED_EYES: Mood[] = ["happy", "hug", "cheer", "spin"];
const SMILE: Mood[] = ["happy", "hug", "cheer", "spin", "wave"];
const WIDE_EYES: Mood[] = ["alarm", "whoa"];

/**
 * Aura-kun: a shield-cut (chamfered) body, square eyes, square limbs. Pure SVG; every color is a
 * theme token (see `.mk-*` in styles/index.css), so light and dark need no extra assets.
 * Eye tracking is driven from outside through the --lx / --ly custom properties on the <svg>.
 */
export function AuraKun({ mood, shades = false, blinking = false, className }: AuraKunProps) {
  const asleep = mood === "sleep";
  const closed = CLOSED_EYES.includes(mood);
  const wide = WIDE_EYES.includes(mood);
  const annoyed = mood === "annoyed";
  const inspect = mood === "inspect";
  const stunned = mood === "stunned";
  const shy = mood === "shy";
  const wave = mood === "wave";
  const worry = mood === "worry";
  const armsUp = ARMS_UP.includes(mood);
  const blink = blinking ? "mk-blink" : "";

  return (
    <svg
      viewBox="0 -12 132 144"
      aria-hidden
      focusable="false"
      className={[
        "mk",
        mood === "idle" ? "mk-bob" : "",
        mood === "hop" || mood === "cheer" ? "mk-hop" : "",
        mood === "spin" ? "mk-spin" : "",
        mood === "alarm" ? "animate-shake" : "",
        className ?? "",
      ].join(" ")}
    >
      <g transform="translate(4 2)">
        {/* antenna: the "aura" */}
        <rect className="mk-limb" x="27" y="-2" width="4" height="10" />
        <rect className="mk-aura" x="23" y="-10" width="12" height="10" />

        {/* hard shadow */}
        <path className="mk-ink" d="M19 13 H97 L115 31 V107 H37 L19 89 Z" />

        {/* feet */}
        <rect className="mk-limb" x="42" y="102" width="16" height="10" />
        <rect className="mk-limb" x="82" y="102" width="16" height="10" />

        {/* arms */}
        <g className="mk-arm" style={{ transform: armsUp ? "translateY(-16px)" : undefined }}>
          {!shy && <rect className="mk-limb" x="2" y="56" width="12" height="14" />}
        </g>
        <g className="mk-arm" style={{ transform: armsUp || inspect || wave ? "translateY(-16px)" : undefined }}>
          {!shy && (
            <g className={wave ? "mk-wave" : undefined}>
              <rect className="mk-limb" x="110" y="56" width="12" height="14" />
            </g>
          )}
          {mood === "kill" && (
            <>
              <rect className="mk-limb" x="112" y="44" width="16" height="14" style={{ fill: "var(--danger)" }} />
              <rect className="mk-shine" x="115" y="47" width="5" height="4" />
            </>
          )}
        </g>

        {/* body */}
        <path className="mk-body" d="M14 8 H92 L110 26 V102 H32 L14 84 Z" />

        {/* cheeks */}
        <g className={mood === "hug" ? "mk-cheek-big" : "mk-cheek"}>
          <rect className="mk-blush" x="22" y="64" width="12" height="7" />
          <rect className="mk-blush" x="90" y="64" width="12" height="7" />
        </g>

        {/* eyes (tracked) */}
        <g className="mk-look">
          {stunned ? (
            <>
              <polyline className="mk-line" points="34,42 50,58" />
              <polyline className="mk-line" points="50,42 34,58" />
              <polyline className="mk-line" points="74,42 90,58" />
              <polyline className="mk-line" points="90,42 74,58" />
            </>
          ) : closed ? (
            <>
              <polyline className="mk-line" points="34,56 42,44 50,56" />
              <polyline className="mk-line" points="74,56 82,44 90,56" />
            </>
          ) : asleep ? (
            <>
              <rect className="mk-eye" x="34" y="50" width="16" height="3" />
              <rect className="mk-eye" x="74" y="50" width="16" height="3" />
            </>
          ) : wide ? (
            <>
              <rect className="mk-eye" x="32" y="36" width="20" height="26" />
              <rect className="mk-shine" x="35" y="39" width="6" height="6" />
              <rect className="mk-eye" x="72" y="36" width="20" height="26" />
              <rect className="mk-shine" x="75" y="39" width="6" height="6" />
            </>
          ) : inspect ? (
            <>
              <rect className="mk-eye" x="34" y="40" width="16" height="20" />
              <rect className="mk-shine" x="37" y="43" width="5" height="5" />
              {/* right eye magnified behind the lens */}
              <rect className="mk-eye" x="72" y="36" width="22" height="26" />
              <rect className="mk-shine" x="76" y="40" width="6" height="6" />
            </>
          ) : annoyed ? (
            <>
              <rect className="mk-eye" x="34" y="48" width="16" height="12" />
              <rect className="mk-eye" x="74" y="48" width="16" height="12" />
              <polyline className="mk-line" points="30,40 52,47" />
              <polyline className="mk-line" points="94,40 72,47" />
            </>
          ) : (
            <g className={worry ? "mk-scan" : undefined}>
              <g className={blink}>
                <rect className="mk-eye" x="34" y="40" width="16" height="20" />
                <rect className="mk-shine" x="37" y="43" width="5" height="5" />
              </g>
              <g className={blink}>
                <rect className="mk-eye" x="74" y="40" width="16" height="20" />
                <rect className="mk-shine" x="77" y="43" width="5" height="5" />
              </g>
            </g>
          )}
        </g>

        {/* shades (easter egg) */}
        {shades && !asleep && (
          <g>
            <rect className="mk-eye" x="26" y="38" width="32" height="20" />
            <rect className="mk-eye" x="66" y="38" width="32" height="20" />
            <rect className="mk-eye" x="58" y="42" width="8" height="4" />
            <rect className="mk-eye" x="14" y="42" width="12" height="3" />
            <rect className="mk-eye" x="98" y="42" width="12" height="3" />
            <polygon className="mk-shine" points="32,40 40,40 34,56 26,56" style={{ opacity: 0.55 }} />
            <polygon className="mk-shine" points="72,40 80,40 74,56 66,56" style={{ opacity: 0.55 }} />
          </g>
        )}

        {/* shy: both hands over the eyes (also covers the shades) */}
        {shy && (
          <>
            <rect className="mk-limb" x="24" y="36" width="36" height="28" />
            <rect className="mk-limb" x="64" y="36" width="36" height="28" />
            <rect className="mk-shine" x="28" y="40" width="5" height="4" />
            <rect className="mk-shine" x="68" y="40" width="5" height="4" />
          </>
        )}

        {/* mouth */}
        {SMILE.includes(mood) ? (
          <polyline className="mk-line" points="54,63 58,69 66,69 70,63" />
        ) : mood === "alarm" || mood === "whoa" ? (
          <rect className="mk-eye" x="58" y="63" width="8" height="10" />
        ) : asleep ? (
          <rect className="mk-eye" x="59" y="65" width="6" height="5" />
        ) : annoyed || stunned || worry || mood === "kill" ? (
          <polyline className="mk-line" points="52,69 57,65 62,69 67,65 72,69" style={{ strokeWidth: 3 }} />
        ) : mood === "guard" ? (
          <polyline className="mk-line" points="54,68 62,68 70,63" style={{ strokeWidth: 3 }} />
        ) : (
          <rect className="mk-eye" x="56" y="65" width="12" height="3" />
        )}

        {/* chest lock, or a red X when an attack lands */}
        {mood === "alarm" ? (
          <>
            <path d="M50 80 L74 98 M74 80 L50 98" className="mk-x-halo" />
            <path d="M50 80 L74 98 M74 80 L50 98" className="mk-x" />
          </>
        ) : (
          <>
            <path d="M58 88 V84 a4 4 0 0 1 8 0 V88" className="mk-line" style={{ strokeWidth: 3 }} />
            <rect className="mk-eye" x="55" y="88" width="14" height="10" />
            <rect className="mk-body-fill" x="61" y="91" width="2" height="4" />
          </>
        )}

        {/* magnifier (square frame, like everything else) */}
        {inspect && (
          <g>
            <polyline className="mk-handle" points="96,64 112,50" />
            <rect className="mk-lens" x="66" y="30" width="36" height="36" />
            <polyline className="mk-lens-glint" points="72,38 80,38 72,46" />
          </g>
        )}

        {/* extras */}
        {(mood === "alarm" || mood === "kill" || worry) && (
          <polygon className="mk-sweat" points="104,30 99,38 104,45 109,38" />
        )}
        {stunned && (
          <>
            <rect className="mk-aura" x="56" y="-8" width="7" height="7" />
            <rect className="mk-aura" x="80" y="-4" width="6" height="6" />
          </>
        )}
        {asleep && (
          <>
            <text className="mk-text mk-z" x="100" y="22" fontSize="14">z</text>
            <text className="mk-text mk-z mk-z2" x="108" y="10" fontSize="18">Z</text>
          </>
        )}
        {(mood === "hug" || mood === "cheer") && (
          <>
            <path className="mk-sparkle" d="M8 30 h8 M12 26 v8" />
            <path className="mk-sparkle" d="M108 18 h8 M112 14 v8" />
          </>
        )}
        {mood === "cheer" && <path className="mk-sparkle" d="M96 -2 h6 M99 -5 v6" />}
      </g>
    </svg>
  );
}
