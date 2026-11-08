import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { explanation, job, jobDetail, jsonResponse, SAFE, state, TX } from "@/test/apiFixtures";
import { ActivityPanel } from "./ActivityPanel";
import { ExplanationCard } from "./components/ExplanationCard";
import { JobDetail } from "./components/JobDetail";
import { JobTimeline } from "./components/JobTimeline";
import { tokenBook } from "./jobView";

const tokens = tokenBook(state);
const noop = () => {};

describe("ExplanationCard", () => {
  it("swaps a late explanation in place, in the same box", () => {
    const { rerender } = render(<ExplanationCard explanation={null} status="confirmed" terminal />);
    const box = screen.getByTestId("explanation-card");
    expect(box).toHaveTextContent("Đang viết giải thích…");
    expect(box).toHaveClass("min-h-28");

    rerender(<ExplanationCard explanation={{ ...explanation, source: "llm" }} status="confirmed" terminal />);
    expect(screen.getByTestId("explanation-card")).toBe(box); // same element: no remount, no jump
    expect(box).toHaveClass("min-h-28");
    expect(box).toHaveTextContent(explanation.messageVi);
    expect(box).toHaveTextContent("LLM");
    expect(box).toHaveTextContent("13,3%");
    expect(box).toHaveAttribute("aria-live", "polite");
  });

  it("labels template explanations and colors blocked verdicts as danger", () => {
    render(<ExplanationCard explanation={{ ...explanation, verdict: "blocked" }} status="rejected" terminal />);
    const box = screen.getByTestId("explanation-card");
    expect(box).toHaveTextContent("TEMPLATE");
    expect(box).toHaveClass("border-danger");
  });

  it("says why there is no explanation yet or at all", () => {
    const { rerender } = render(<ExplanationCard explanation={null} status="simulating" terminal={false} />);
    expect(screen.getByTestId("explanation-card")).toHaveTextContent("Giải thích sẽ có khi lệnh chạy xong.");
    rerender(<ExplanationCard explanation={null} status="failed" terminal />);
    expect(screen.getByTestId("explanation-card")).toHaveTextContent("Lệnh lỗi hạ tầng nên không có giải thích.");
  });
});

describe("JobTimeline", () => {
  const jobs = [
    job({ id: "00000000-0000-4000-8000-000000000001", status: "confirmed", txHash: TX, explanation }),
    job({
      id: "00000000-0000-4000-8000-000000000002",
      status: "rejected",
      intent: { ...job().intent!, amountIn: "2000000000" },
      reasonCode: "ExceedsPerTxCap",
    }),
    job({ id: "00000000-0000-4000-8000-000000000003", status: "reverted", kind: "attack", origin: "redteam", intent: null, txHash: TX, revertError: "GS104" }),
    job({ id: "00000000-0000-4000-8000-000000000004", status: "simulating" }),
  ];

  it("shows who decided, the verdict stamp, the reason and the Snowtrace link", () => {
    render(<JobTimeline jobs={jobs} tokens={tokens} openId={null} onToggle={noop} renderDetail={() => null} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(4);

    const [ok, shield1, shield2, running] = rows as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    expect(within(ok).getByText("APPROVE")).toBeInTheDocument();
    expect(within(ok).getByText("Đã khớp lệnh 200 USDC")).toBeInTheDocument();
    expect(within(ok).getByRole("link", { name: /Snowtrace/ })).toHaveAttribute("href", `https://testnet.snowtrace.io/tx/${TX}`);

    expect(within(shield1).getByText("BLOCKED")).toBeInTheDocument();
    expect(within(shield1).getByText("Shield 1 chặn lệnh 2.000 USDC")).toBeInTheDocument();
    expect(within(shield1).getByText("Vượt hạn mức mỗi lệnh")).toBeInTheDocument();
    expect(within(shield1).queryByRole("link", { name: /Snowtrace/ })).not.toBeInTheDocument();

    expect(within(shield2).getByText("Shield 2 chặn lệnh")).toBeInTheDocument();
    expect(within(shield2).getByText("Safe từ chối (GS104)")).toBeInTheDocument();
    expect(within(shield2).getByRole("link", { name: /Snowtrace/ })).toBeInTheDocument();

    expect(within(running).queryByText("APPROVE")).not.toBeInTheDocument();
    expect(within(running).getByText("Shield 1 đang chạy thử")).toBeInTheDocument();
  });

  it("toggles one detail at a time", () => {
    const onToggle = vi.fn();
    const renderDetail = vi.fn(() => <p>detail</p>);
    const { rerender } = render(<JobTimeline jobs={jobs} tokens={tokens} openId={null} onToggle={onToggle} renderDetail={renderDetail} />);
    const buttons = screen.getAllByRole("button", { name: /Chi tiết kiểm tra/ });
    fireEvent.click(buttons[1]!);
    expect(onToggle).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002");
    expect(renderDetail).not.toHaveBeenCalled();

    rerender(<JobTimeline jobs={jobs} tokens={tokens} openId="00000000-0000-4000-8000-000000000002" onToggle={onToggle} renderDetail={renderDetail} />);
    expect(renderDetail).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002");
    expect(screen.getAllByRole("button", { name: /Chi tiết kiểm tra/ })[1]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("detail")).toBeInTheDocument();
  });
});

describe("JobDetail", () => {
  it("shows the four audit stages and the simulated deltas", () => {
    const ts = "2026-11-09T10:00:01.000Z";
    const detail = jobDetail({
      status: "confirmed",
      sim: { ok: true, deltaSafeTokenIn: "-200000000", deltaSafeTokenOut: "9500000000000000000", attackerBalance: "0", allowanceAfter: "0" },
      audit: [
        { shield: "precheck", result: "pass", reason: null, ts },
        { shield: "simulation", result: "pass", reason: null, ts },
        { shield: "invariant", result: "pass", reason: null, ts },
        { shield: "onchain", result: "pass", reason: null, ts },
      ],
    });
    render(<JobDetail detail={detail} isLoading={false} isError={false} tokens={tokens} />);
    expect(screen.getAllByText("Qua")).toHaveLength(4);
    expect(screen.getByText("200 USDC")).toBeInTheDocument();
    expect(screen.getByText("9,5 WAVAX")).toBeInTheDocument();
  });

  it("lists every failed precheck reason and the stages that never ran", () => {
    const ts = "2026-11-09T10:00:01.000Z";
    const detail = jobDetail({
      status: "rejected",
      precheck: { ok: false, reasons: ["ExceedsPerTxCap", "ExceedsDailyCap"] },
      audit: [{ shield: "precheck", result: "fail", reason: "ExceedsPerTxCap", ts }],
    });
    render(<JobDetail detail={detail} isLoading={false} isError={false} tokens={tokens} />);
    expect(screen.getByText("Chặn")).toBeInTheDocument();
    expect(screen.getAllByText("Không chạy")).toHaveLength(3);
    expect(screen.getByText("Vượt hạn mức ngày")).toBeInTheDocument();
  });

  it("has loading and error states", () => {
    const { rerender } = render(<JobDetail detail={undefined} isLoading isError={false} tokens={tokens} />);
    expect(screen.getByText("Đang tải chi tiết kiểm tra")).toBeInTheDocument();
    rerender(<JobDetail detail={undefined} isLoading={false} isError tokens={tokens} />);
    expect(screen.getByText(/Không tải được chi tiết/)).toBeInTheDocument();
  });
});

describe("ActivityPanel", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let qc: QueryClient;
  const wrap = (ui: ReactNode) => <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("without a vault address shows an honest empty state and needs no QueryClient", () => {
    render(<ActivityPanel safe={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("chưa được deploy");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the vault's jobs", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/state")) return jsonResponse(state);
      if (url.includes("/jobs")) return jsonResponse({ items: [job({ status: "rejected", reasonCode: "ExceedsPerTxCap" })], nextCursor: null });
      return new Response(null, { status: 404 });
    });
    render(wrap(<ActivityPanel safe={SAFE} />));
    expect(await screen.findByText("Shield 1 chặn lệnh 200 USDC")).toBeInTheDocument();
  });

  it("says so when the vault has no jobs yet", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/jobs") ? jsonResponse({ items: [], nextCursor: null }) : jsonResponse(state),
    );
    render(wrap(<ActivityPanel safe={SAFE} />));
    expect(await screen.findByText("Chưa có lệnh nào")).toBeInTheDocument();
  });

  it("shows the API error and retries", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(wrap(<ActivityPanel safe={SAFE} />));
    expect(await screen.findByText("Chưa kết nối được API vault")).toBeInTheDocument();
    expect(screen.getByText(/Không kết nối được máy chủ/)).toBeInTheDocument();

    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/jobs") ? jsonResponse({ items: [], nextCursor: null }) : jsonResponse(state),
    );
    fireEvent.click(screen.getByRole("button", { name: /Thử lại/ }));
    await waitFor(() => expect(screen.getByText("Chưa có lệnh nào")).toBeInTheDocument());
  });
});
