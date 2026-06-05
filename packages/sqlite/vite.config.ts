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
    entry: ["src/index.ts", "src/sqlite3.ts", "src/better-sqlite3.ts", "src/libsql.ts"],
    treeshake: true,
    minify: true,
    deps: {
      neverBundle: [
        "@healthzkit/shared",
        "sqlite3",
        "better-sqlite3",
        "@libsql/client",
        "healthzkit",
      ],
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
