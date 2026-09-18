// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const legacyLogin = vi.fn();
const modalLogin = vi.fn();

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    ready: true,
    authenticated: false,
    getAccessToken: vi.fn(),
    login: legacyLogin,
    logout: vi.fn(),
  }),
  useLogin: () => ({ login: modalLogin }),
}));

import { usePrivySession } from "../../src/auth/privy-session.js";

function SessionLoginProbe() {
  const session = usePrivySession();
  return <button type="button" onClick={session.login}>Sign in</button>;
}

describe("usePrivySession", () => {
  it("uses the current Privy login-modal hook for sign-in", () => {
    render(<SessionLoginProbe />);

    screen.getByRole("button", { name: "Sign in" }).click();

    expect(modalLogin).toHaveBeenCalledOnce();
    expect(legacyLogin).not.toHaveBeenCalled();
  });
});
