// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LandingScreen } from "../../src/screens/LandingScreen.js";
import type { Session } from "../../src/auth/session.js";

const session: Session = {
  isReady: true,
  isAuthenticated: false,
  getAccessToken: async () => null,
  login: () => undefined,
  logout: () => undefined,
};

describe("landing scope disclosure", () => {
  afterEach(cleanup);

  it("explains the consumer goals and commitments journey", () => {
    render(<MemoryRouter><LandingScreen session={session} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Keep your commitments. Grow your savings." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pick a goal" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Follow through" })).toBeTruthy();
  });

  it("links only to the current public information surfaces", () => {
    render(<MemoryRouter><LandingScreen session={session} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Verification" }).getAttribute("href")).toBe("/verification");
    expect(screen.queryByRole("link", { name: "Sponsors" })).toBeNull();
  });
});
