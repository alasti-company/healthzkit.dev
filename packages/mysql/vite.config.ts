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
    entry: ["./src/index.ts", "./src/mysql.ts", "./src/mysql2.ts"],
    treeshake: true,
    minify: true,
    deps: {
      neverBundle: ["healthzkit", "mysql", "mysql2"],
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
