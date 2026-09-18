// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/app.js";
import type { Session } from "../../src/auth/session.js";

vi.mock("../../src/chain/evm-wallet.js", () => ({ useKeptEvmWallet: () => ({ isReady: true, address: null }) }));
vi.mock("../../src/chain/transaction-sender.js", () => ({ useKeptTransactionSender: () => ({ sendTransaction: vi.fn() }) }));
vi.mock("../../src/api/kept-api.js", () => ({
  readApiBaseUrl: () => "http://127.0.0.1:3000",
  createKeptApi: () => ({
    listGoals: async () => [],
    listCommitments: async () => [],
    createGoal: vi.fn(),
    createCommitment: vi.fn(),
    activateCommitment: vi.fn(),
    cancelCommitment: vi.fn(),
  }),
}));

const signedInSession: Session = {
  isReady: true,
  isAuthenticated: true,
  getAccessToken: async () => "access-token",
  login: () => undefined,
  logout: () => undefined,
};

describe("Kept navigation", () => {
  afterEach(cleanup);

  it("navigates between the dashboard and landing page", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/dashboard"]}><App session={signedInSession} /></MemoryRouter>);
    await user.click(await screen.findByRole("link", { name: "Kept home" }));
    expect(await screen.findByRole("heading", { name: "Keep your commitments. Grow your savings." })).toBeTruthy();
  });

  it("returns to the product-first dashboard", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/"]}><App session={signedInSession} /></MemoryRouter>);
    await user.click(await screen.findByRole("link", { name: "Dashboard" }));
    expect(await screen.findByRole("heading", { name: "Keep moving towards what matters." })).toBeTruthy();
  });

  it("redirects the removed vault route to the dashboard", async () => {
    render(<MemoryRouter initialEntries={["/vaults"]}><App session={signedInSession} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Keep moving towards what matters." })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Choose a savings vault" })).toBeNull();
  });

  it("keeps sign in as the landing-page action for a signed-out user", async () => {
    const user = userEvent.setup();
    const login = vi.fn();
    render(<MemoryRouter initialEntries={["/"]}><App session={{ isAuthenticated: false, isReady: true, getAccessToken: async () => null, login, logout: vi.fn() }} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(login).toHaveBeenCalledOnce();
  });
});
