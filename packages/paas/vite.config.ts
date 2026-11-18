import { dirname, join } from "node:path";
import { defineConfig } from "vite-plus";

// Listing every platform entry makes Vite resolve `vite-plus/test` to a
// different Vitest install than the one executing the tests. Alias it to the
// running Vitest so `describe` and the runner share one module instance.
const runner = process.argv.find(
  (arg) => arg.endsWith("/vitest.mjs") || arg.endsWith("\\vitest.mjs"),
);

export default defineConfig({
  ...(runner
    ? {
        resolve: {
          alias: {
            "vite-plus/test": join(dirname(runner), "dist/index.js"),
          },
        },
      }
    : {}),
  pack: {
    dts: {
      generator: "tsgo",
    },
    exports: true,
    sourcemap: false,
    format: ["esm"],
    clean: true,
    entry: [
      "src/index.ts",
      "src/azure-app-service.ts",
      "src/azure-container-apps.ts",
      "src/cloud-run.ts",
      "src/digitalocean.ts",
      "src/fly.ts",
      "src/koyeb.ts",
      "src/railway.ts",
      "src/render.ts",
      "src/vercel.ts",
    ],
    treeshake: true,
    minify: true,
    deps: {
      neverBundle: ["healthzkit"],
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
