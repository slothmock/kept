// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LandingScreen } from "./screens/LandingScreen.js";
import type { Session } from "./session.js";

const session: Session = {
  isReady: true,
  isAuthenticated: false,
  getAccessToken: async () => null,
  login: () => undefined,
  logout: () => undefined,
};

describe("landing scope disclosure", () => {
  afterEach(cleanup);

  it("does not present funding as live before the vault deployment and Aurora route exist", () => {
    render(
      <MemoryRouter>
        <LandingScreen session={session} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Funding is not live yet/)).toBeTruthy();
  });

  it("explains the consumer savings journey in the second section", () => {
    render(
      <MemoryRouter>
        <LandingScreen session={session} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Keep your commitments. Grow your savings." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Build a savings habit around what matters to you" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pick a goal" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Make a simple plan" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Follow through" })).toBeTruthy();
    expect(screen.getByText(/Current demo uses local test assets/)).toBeTruthy();
  });

  it("follows the journey with a why Kept is different section", () => {
    render(
      <MemoryRouter>
        <LandingScreen session={session} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("region", { name: "Why Kept is different" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your savings come first" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Encouragement, not punishment" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Privacy by default" })).toBeTruthy();
  });

  it("has a landing footer that identifies the local demo", () => {
    render(
      <MemoryRouter>
        <LandingScreen session={session} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(screen.getByText("Local test demo")).toBeTruthy();
  });

  it("links to public privacy, terms, verification, and sponsors pages", () => {
    render(
      <MemoryRouter>
        <LandingScreen session={session} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Verification" }).getAttribute("href")).toBe("/verification");
    expect(screen.getByRole("link", { name: "Sponsors" }).getAttribute("href")).toBe("/sponsors");
  });
});
