import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import { nodePolyfills } from "@blocksquaredev/vite-plugin-node-polyfills";

function keptInstallIcons(): Plugin {
  const images = [
    ["kept-192.png", "kept-logo-192x192.png"],
    ["kept-512.png", "kept-logo-512x512.png"],
  ] as const;

  return {
    name: "kept-install-icons",
    apply: "build",
    generateBundle() {
      for (const [output, input] of images) {
        this.emitFile({
          type: "asset",
          fileName: `icons/${output}`,
          source: readFileSync(
            fileURLToPath(new URL(`./src/assets/img/${input}`, import.meta.url)),
          ),
        });
      }
    },
  };
}

export default defineConfig({
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  plugins: [
    react(),
    keptInstallIcons(),
    tailwindcss(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: false,
      },
      protocolImports: true,
    }),
  ],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
});
