import { act, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom renders the whole dashboard here; on a loaded machine (CI, right after a build) the
// default 1 s for waitFor was seen to run out once. The tour itself opens after 0 ms in tests.
configure({ asyncUtilTimeout: 3_000 });
import { VaultDashboardPlaceholder } from "@/app/routes/VaultDashboardPlaceholder";
import { GuidedTour, TourButton } from "./GuidedTour";
import { DEMO_TOUR_SEEN_KEY, DEMO_TOUR_STEPS } from "./tourSteps";
import { useTour } from "./useTour";

function Harness({ autoStart = true }: { autoStart?: boolean }) {
  const tour = useTour(DEMO_TOUR_STEPS, { storageKey: DEMO_TOUR_SEEN_KEY, autoStart, autoStartDelayMs: 0 });
  return (
    <>
      <TourButton onClick={tour.start} />
      <VaultDashboardPlaceholder mode="demo" safe={null} />
      <GuidedTour tour={tour} />
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const dialog = () => screen.queryByRole("dialog");

describe("demo tour content", () => {
  it("has at most 6 steps with Vietnamese copy", () => {
    expect(DEMO_TOUR_STEPS.length).toBeGreaterThan(0);
    expect(DEMO_TOUR_STEPS.length).toBeLessThanOrEqual(6);
    expect(new Set(DEMO_TOUR_STEPS.map((s) => s.id)).size).toBe(DEMO_TOUR_STEPS.length);
    for (const s of DEMO_TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeLessThanOrEqual(260);
    }
  });

  it("shows no numbers that look like live data", () => {
    for (const s of DEMO_TOUR_STEPS) expect(`${s.title} ${s.body}`).not.toMatch(/\d[\d.,]*\s*(USDC|WAVAX|AVAX|%|sec|s\b)/i);
  });

  it("every anchor exists on the dashboard", () => {
    render(<VaultDashboardPlaceholder mode="demo" safe={null} />);
    for (const s of DEMO_TOUR_STEPS) {
      if (s.anchor) expect(document.querySelectorAll(`[data-tour~="${s.anchor}"]`).length, s.anchor).toBeGreaterThan(0);
    }
  });
});

describe("GuidedTour", () => {
  it("opens by itself on the first visit and focuses the next button", async () => {
    render(<Harness />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(screen.getByText(`Tour · Step 1/${DEMO_TOUR_STEPS.length}`)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Next/ })).toHaveFocus());
    expect(dialog()).toHaveAttribute("aria-modal", "true");
  });

  it("Esc skips and remembers it, so it does not reopen", async () => {
    const { unmount } = render(<Harness />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog()).not.toBeInTheDocument();
    expect(localStorage.getItem(DEMO_TOUR_SEEN_KEY)).toBe("1");
    unmount();

    render(<Harness />);
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(dialog()).not.toBeInTheDocument();
  });

  it("walks every step with buttons and arrow keys, then finishes", async () => {
    localStorage.setItem(DEMO_TOUR_SEEN_KEY, "1");
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Show the guided tour" }));
    expect(screen.getByRole("heading", { name: DEMO_TOUR_STEPS[0]!.title })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByRole("heading", { name: DEMO_TOUR_STEPS[1]!.title })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { name: DEMO_TOUR_STEPS[0]!.title })).toBeInTheDocument();

    for (let i = 1; i < DEMO_TOUR_STEPS.length; i++) fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("heading", { name: DEMO_TOUR_STEPS.at(-1)!.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Done/ }));
    expect(dialog()).not.toBeInTheDocument();
  });

  it("returns focus to the replay button when closed", async () => {
    localStorage.setItem(DEMO_TOUR_SEEN_KEY, "1");
    render(<Harness />);
    const replay = screen.getByRole("button", { name: "Show the guided tour" });
    replay.focus();
    fireEvent.click(replay);
    expect(dialog()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(replay).toHaveFocus());
  });

  it("keeps Tab inside the card", async () => {
    localStorage.setItem(DEMO_TOUR_SEEN_KEY, "1");
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Show the guided tour" }));
    const next = screen.getByRole("button", { name: /Next/ });
    const closeX = screen.getByRole("button", { name: "Skip the tour" });
    next.focus();
    fireEvent.keyDown(next, { key: "Tab" });
    expect(closeX).toHaveFocus();
    fireEvent.keyDown(closeX, { key: "Tab", shiftKey: true });
    expect(next).toHaveFocus();
  });

  it("still works when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    render(<Harness />);
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog()).not.toBeInTheDocument();
  });

  it("does not auto start when disabled", async () => {
    render(<Harness autoStart={false} />);
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(dialog()).not.toBeInTheDocument();
  });
});
