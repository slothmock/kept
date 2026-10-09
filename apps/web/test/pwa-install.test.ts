import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const publicFile = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../public/${name}`, import.meta.url)), "utf8");

describe("Kept PWA deployment", () => {
  it("declares an installable standalone app with stable icon URLs", () => {
    const manifest = JSON.parse(publicFile("manifest.webmanifest")) as {
      name: string;
      start_url: string;
      scope: string;
      display: string;
      icons: { src: string; sizes: string }[];
    };

    expect(manifest.name).toBe("Kept");
    expect(manifest.start_url).toBe("/dashboard");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icons/kept-192.png", sizes: "192x192" }),
      expect.objectContaining({ src: "/icons/kept-512.png", sizes: "512x512" }),
    ]));
  });

  it("only allows caching versioned static assets, not authenticated data", () => {
    const script = publicFile("sw.js");
    expect(script).toContain('request.method !== "GET"');
    expect(script).toContain('request.mode === "navigate"');
    expect(script).toContain('url.origin !== self.location.origin');
    expect(script).toContain('request.headers.has("Authorization")');
    expect(script).toContain('STATIC_ASSET.test(url.pathname)');
    expect(script).not.toContain('cache.addAll(["/"]');
  });
});
