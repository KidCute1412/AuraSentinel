/** Tiny window event so the "Try to rob it" button can launch a burst in the hero AttackLane. */
export const ATTACK_EVENT = "agentshield:attack";

export function fireAttack(): void {
  window.dispatchEvent(new CustomEvent(ATTACK_EVENT));
}
