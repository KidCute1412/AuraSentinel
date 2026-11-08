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
    title: "Két có AI giao dịch hộ",
    body: "Đây là một két (Safe) trên Avalanche Fuji. Một agent AI được mua bán bằng tiền trong két 24/7, nhưng không có cách nào rút tiền ra. Ô nào ghi “Chưa nối” sẽ có dữ liệu thật khi contract lên Fuji.",
  },
  {
    id: "rebalance",
    anchor: "redteam-rebalance",
    title: "Một lệnh hợp lệ",
    body: "Chạy rebalance gửi một lệnh nằm trong hạn mức. Khiên 1 (máy chủ) kiểm tra và chạy thử trước, Khiên 2 (contract trên chain) kiểm lại lần nữa rồi mới cho khớp.",
  },
  {
    id: "attacks",
    anchor: "redteam-attacks",
    title: "Thử tấn công thật",
    body: "4 đòn: rút quá hạn mức, đổi người nhận, xin quyền rút vô hạn và gọi thẳng contract để bỏ qua website. Đòn cuối né được Khiên 1, nhưng contract vẫn chặn và để lại giao dịch bị revert trên Snowtrace.",
  },
  {
    id: "activity",
    anchor: "activity",
    title: "Lệnh nào bị chặn, vì sao",
    body: "Dòng thời gian cho biết khiên nào cho qua, khiên nào chặn, kèm câu giải thích tiếng Việt. AI chỉ viết lời giải thích; duyệt hay chặn là do code cố định quyết định.",
  },
  {
    id: "balances",
    anchor: "balances",
    title: "Số liệu lấy từ chain",
    body: "Số dư két và phần hạn mức ngày đã dùng được đọc thẳng từ blockchain, không lấy từ cơ sở dữ liệu của chúng tôi.",
  },
  {
    id: "kill-switch",
    anchor: "kill-switch",
    title: "Chủ két luôn có nút khoá",
    body: "Kill-Switch là một giao dịch chủ két tự ký trong ví. Agent bị khoá ngay trên chain, kể cả khi máy chủ AgentShield đang tắt.",
  },
];

/** localStorage key for "already seen". Bump the version when the steps change meaningfully. */
export const DEMO_TOUR_SEEN_KEY = "agentshield.demo-tour.seen.v1";
