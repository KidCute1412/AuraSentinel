import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { Header } from "./Header";

const renderHeader = (path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>,
  );

describe("Header", () => {
  // jsdom has no matchMedia; ThemeToggle listens to the OS colour scheme through it.
  beforeAll(() => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    })) as typeof window.matchMedia;
  });

  it("keeps the secondary pages inside a menu, one tap away", () => {
    renderHeader();
    expect(screen.queryByRole("link", { name: "Proof" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("menuitem", { name: "Create vault" })).toHaveAttribute("href", "/vaults/new");
    expect(screen.getByRole("menuitem", { name: "Proof" })).toHaveAttribute("href", "/proof");
    expect(screen.getByRole("menuitem", { name: "About" })).toHaveAttribute("href", "/about");
  });

  it("marks the current page and offers Sign in to guests", () => {
    renderHeader("/proof");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("menuitem", { name: "Proof" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
  });

  it("moves between menu items with the arrow keys", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("menuitem", { name: "Demo" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Create vault" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "End" });
    expect(screen.getByRole("menuitem", { name: "About" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Demo" })).toHaveFocus();
  });
});
