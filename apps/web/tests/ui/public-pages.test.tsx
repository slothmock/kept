// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/app.js";
import type { Session } from "../../src/auth/session.js";

vi.mock("../../src/chain/evm-wallet.js", () => ({ useKeptEvmWallet: () => ({ isReady: true, address: null }) }));
vi.mock("../../src/chain/transaction-sender.js", () => ({ useKeptTransactionSender: () => ({ sendTransaction: vi.fn() }) }));

const session: Session = {
  isReady: true,
  isAuthenticated: false,
  getAccessToken: async () => null,
  login: () => undefined,
  logout: () => undefined,
};

describe("public information pages", () => {
  afterEach(cleanup);

  it("explains the privacy boundary", () => {
    render(<MemoryRouter initialEntries={["/privacy"]}><App session={session} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What stays private" })).toBeTruthy();
  });

  it("states the demo limitations", () => {
    render(<MemoryRouter initialEntries={["/terms"]}><App session={session} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Terms" })).toBeTruthy();
    expect(screen.getByText(/test assets have no monetary value/i)).toBeTruthy();
  });

  it("describes only financial and activity verification", () => {
    render(<MemoryRouter initialEntries={["/verification"]}><App session={session} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Weekly saving" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Verified activity count" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Private study verification" })).toBeNull();
    expect(screen.getByText(/Kept’s own earned revenue/i)).toBeTruthy();
  });
});
