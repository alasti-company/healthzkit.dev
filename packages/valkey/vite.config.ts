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
    entry: ["src/index.ts", "src/iovalkey.ts", "src/valkey-glide.ts"],
    treeshake: true,
    minify: true,
    deps: {
      neverBundle: ["@healthzkit/shared", "healthzkit", "iovalkey", "@valkey/valkey-glide"],
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
