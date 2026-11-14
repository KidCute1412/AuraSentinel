import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./AccountMenu";

const signOut = vi.fn();
vi.mock("@/shared/session/useSignOut", () => ({ useSignOut: () => signOut }));

const wallet = { address: "0x7A3f5C9e21B84dD0a6F13c8E92b7064a1c91Cd02" as const, chainId: 43113 };

const renderMenu = () =>
  render(
    <MemoryRouter>
      <AccountMenu wallet={wallet} />
    </MemoryRouter>,
  );

const openSignOutDialog = () => {
  fireEvent.click(screen.getByRole("button", { name: /^Account 0x/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
};

describe("AccountMenu", () => {
  beforeEach(() => signOut.mockClear());

  it("shows the short address and opens a menu with my vaults and sign out", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /^Account 0x/ });
    expect(trigger).toHaveTextContent("0x7A3f…Cd02");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "My vaults" })).toHaveAttribute("href", "/vaults");
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("closes on Escape and on an outside click", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /^Account 0x/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Account 0x/ }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("asks before signing out, with Cancel focused", () => {
    renderMenu();
    openSignOutDialog();
    expect(screen.getByRole("alertdialog", { name: "Sign out?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("Cancel and Escape keep the session", () => {
    renderMenu();
    openSignOutDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    openSignOutDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out only after confirming", () => {
    renderMenu();
    openSignOutDialog();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
