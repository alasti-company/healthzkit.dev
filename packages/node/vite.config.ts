import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      generator: "tsgo",
    },
    exports: true,
    sourcemap: false,
    format: ["esm"],
    clean: true,
    entry: ["src/index.ts", "src/memory.ts", "src/event-loop.ts", "src/disk.ts"],
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
