import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      tsgo: true,
    },
    exports: true,
    sourcemap: false,
    format: ["esm"],
    clean: true,
    entry: ["src/index.ts", "src/pg.ts"],
    treeshake: true,
    minify: true,
    deps: {
      neverBundle: ["healthzkit", "pg"],
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
