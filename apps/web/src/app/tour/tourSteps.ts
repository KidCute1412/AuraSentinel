/**
 * Guided tour for /demo (ui-pages §4.6). Each step points at a `data-tour` anchor. The anchors sit
 * on the dashboard slots today and must be kept on the real panels that replace them
 * (L7 policy/Kill-Switch, L8 balances, Q9 activity, Q10 red-team). A missing anchor is not an
 * error: the card is then shown centered.
 *
 * Copy rule: describe what the product does, never show numbers that look like live data.
 */
export interface TourStep {
  id: string;
  /** Value of `data-tour` on the element(s) to highlight; several elements may share it. */
  anchor: string | null;
  title: string;
  body: string;
}

export const DEMO_TOUR_STEPS: readonly TourStep[] = [
  {
    id: "vault",
    anchor: "vault-header",
    title: "A vault an AI trades for",
    body: "This is a vault (Safe) on Avalanche Fuji. An AI agent trades with its funds 24/7 but has no way to take them out. Any box marked “Not wired yet” gets real data once the contract is on Fuji.",
  },
  {
    id: "rebalance",
    anchor: "redteam-rebalance",
    title: "A valid order",
    body: "Run rebalance sends an order within the limits. Shield 1 (the server) checks and simulates it first, then Shield 2 (the contract on-chain) checks it again before the swap goes through.",
  },
  {
    id: "attacks",
    anchor: "redteam-attacks",
    title: "Try a real attack",
    body: "4 attacks: over-withdraw, wrong recipient, unlimited approval, and calling the contract directly to bypass the website. The last one gets past Shield 1, but the contract still blocks it and leaves a reverted transaction on Snowtrace.",
  },
  {
    id: "activity",
    anchor: "activity",
    title: "What was blocked, and why",
    body: "The timeline shows which shield let an order through and which one blocked it, with a plain-language explanation. The AI only writes the explanation; fixed code decides approve or block.",
  },
  {
    id: "balances",
    anchor: "balances",
    title: "Numbers come from the chain",
    body: "Vault balances and the share of the daily cap already used are read straight from the blockchain, not from our database.",
  },
  {
    id: "kill-switch",
    anchor: "kill-switch",
    title: "The owner can always lock it",
    body: "The Kill-Switch is a transaction the owner signs in their own wallet. The agent is locked on-chain at once, even while the AgentShield server is down.",
  },
];

/** localStorage key for "already seen". Bump the version when the steps change meaningfully. */
export const DEMO_TOUR_SEEN_KEY = "agentshield.demo-tour.seen.v1";
