// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./app.js";
import type { Session } from "./session.js";

vi.mock("./kept-evm-wallet.js", () => ({
  useKeptEvmWallet: () => ({ isReady: true, address: null }),
}));

vi.mock("./kept-transaction-sender.js", () => ({
  useKeptTransactionSender: () => ({ sendTransaction: vi.fn() }),
}));

const session: Session = {
  isReady: true,
  isAuthenticated: false,
  getAccessToken: async () => null,
  login: () => undefined,
  logout: () => undefined,
};

describe("public information pages", () => {
  afterEach(cleanup);

  it("explains the privacy boundary without presenting a final privacy notice", () => {
    render(
      <MemoryRouter initialEntries={["/privacy"]}>
        <App session={session} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Privacy" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Information Kept needs" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What stays private" })).toBeTruthy();
    expect(screen.getByText(/public blockchain records financial transactions/i)).toBeTruthy();
    expect(screen.getByText(/full privacy notice will be published before launch/i)).toBeTruthy();
  });

  it("states the demo limitations on the terms page", () => {
    render(
      <MemoryRouter initialEntries={["/terms"]}>
        <App session={session} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Terms" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "A demonstration, not a financial service" })).toBeTruthy();
    expect(screen.getByText(/test assets have no monetary value/i)).toBeTruthy();
    expect(screen.getByText(/no guarantee of returns or rewards/i)).toBeTruthy();
  });

  it("describes all three intended MVP verification paths", () => {
    render(
      <MemoryRouter initialEntries={["/verification"]}>
        <App session={session} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "How verification works" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Weekly saving" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Verified activity count" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Private study verification" })).toBeTruthy();
    expect(screen.getByText(/additional reward is separate from the return on your savings/i)).toBeTruthy();
  });

  it("explains individually funded sponsor contributions without giving sponsors control of savings", () => {
    render(
      <MemoryRouter initialEntries={["/sponsors"]}>
        <App session={session} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Sponsors" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sponsor an individual account" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Fund each contribution up front" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Verify a clear milestone" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Unlock the contribution" })).toBeTruthy();
    expect(screen.getByText(/not competing for what remains in a shared pool/i)).toBeTruthy();
    expect(screen.getByText(/attendance percentage does not need to be published/i)).toBeTruthy();
    expect(screen.getByText(/never receives custody or withdrawal authority/i)).toBeTruthy();
    expect(screen.getByText(/missing a milestone does not affect the participant's own savings/i)).toBeTruthy();
    expect(screen.getByText(/planned concept.*not available in the current local demo/i)).toBeTruthy();
  });
});
