import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminDrawer } from "./AdminDrawer";

describe("AdminDrawer", () => {
  it("renders nothing for guests, users and owners", () => {
    for (const role of [null, undefined, "user", "owner"] as const) {
      const { container, unmount } = render(<AdminDrawer role={role} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("opens for admins and closes on Escape", () => {
    render(<AdminDrawer role="admin" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /admin/i }));
    expect(screen.getByRole("dialog", { name: "Bảng admin" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
