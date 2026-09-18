// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./app.js";
import type { Session } from "./session.js";

const signedInSession: Session = {
  isReady: true,
  isAuthenticated: true,
  getAccessToken: async () => "access-token",
  login: () => undefined,
  logout: () => undefined,
};

describe("Kept navigation", () => {
  afterEach(cleanup);

  it("takes a signed-in saver from the dashboard to the landing page through the Kept logo", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App session={signedInSession} />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("link", { name: "Kept home" }));

    expect(
      await screen.findByRole("heading", {
        name: "Keep your commitments. Grow your savings.",
      }),
    ).toBeTruthy();
  });

  it("returns a signed-in saver to the USDC vault dashboard from the landing page", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App session={signedInSession} />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("link", { name: "Dashboard" }));

    expect(await screen.findByRole("heading", { name: "Your USDC savings" })).toBeTruthy();
  });

  it("shows the two-vault choice page to a signed-in saver", async () => {
    render(
      <MemoryRouter initialEntries={["/vaults"]}>
        <App session={signedInSession} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Choose a savings vault" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Low risk" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "High risk" })).toBeTruthy();
  });

  it("keeps sign in as the landing-page header action for a signed-out user", async () => {
    const user = userEvent.setup();
    const login = vi.fn();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App
          session={{
            isAuthenticated: false,
            isReady: true,
            getAccessToken: async () => null,
            login,
            logout: vi.fn(),
          }}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Sign in" }));

    expect(login).toHaveBeenCalledOnce();
  });
});
