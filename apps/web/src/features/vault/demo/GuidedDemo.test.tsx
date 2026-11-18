import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setMockDelays, useMockChain } from "@/shared/api/mockChain";
import { FIXTURES, FIXTURE_SAFES } from "@/shared/api/vaultSource";
import { GuidedDemo } from "./GuidedDemo";

const demo = FIXTURES[FIXTURE_SAFES.demo.toLowerCase()];

function renderGuided(onFreePlay = vi.fn()) {
  return render(
    <MemoryRouter>
      <GuidedDemo view={demo} onFreePlay={onFreePlay} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setMockDelays({ step: 0, explain: 0, sign: 0, mine: 0 });
  useMockChain.getState().reset();
});

describe("GuidedDemo (simulation)", () => {
  it("one step at a time: the button runs it and the plain-language result shows right under it", async () => {
    renderGuided();
    expect(screen.getByRole("heading", { name: "Let the AI make a normal trade" })).toBeInTheDocument();
    expect(screen.getByText("At most 500 USDC per trade")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Make the trade/ }));
    expect(await screen.findByText("Approved. The trade is on the blockchain.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Normal trade \(done\)/ })).toHaveAttribute("aria-current", "step");

    fireEvent.click(screen.getByRole("button", { name: /Next step/ }));
    expect(screen.getByRole("heading", { name: "Now ask it to take too much" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /Try to take 2,000 USDC/ }));
    expect(await screen.findByText("Blocked before anything was signed.")).toBeInTheDocument();
  });

  it("the contract blocks the bypass on-chain, with the failed transaction as proof", async () => {
    renderGuided();
    fireEvent.click(screen.getByRole("button", { name: /Hack around/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bypass the website/ }));
    expect(await screen.findByText("Blocked by the contract on the blockchain.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See the failed transaction/ })).toBeInTheDocument();
  });

  it("step 4 in the simulation is the real hold-to-confirm Kill-Switch", () => {
    renderGuided();
    fireEvent.click(screen.getByRole("button", { name: /Emergency stop/ }));
    expect(screen.getByRole("heading", { name: "Pull the emergency stop" })).toBeInTheDocument();
    expect(screen.queryByText(/Only the owner's wallet can press this/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hold/ })).toBeInTheDocument();
  });

  it("a step can be skipped, and Back returns to the previous one", () => {
    renderGuided();
    fireEvent.click(screen.getByRole("button", { name: /Skip this step/ }));
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });
});
