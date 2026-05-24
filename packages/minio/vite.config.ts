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
    entry: ["src/index.ts", "src/minio.ts"],
    treeshake: true,
    minify: true,
    deps: {
      neverBundle: ["healthzkit", "minio"],
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
