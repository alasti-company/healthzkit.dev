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
    entry: ["src/index.ts", "src/v2.ts", "src/v3.ts"],
    treeshake: true,
    minify: true,
    deps: {
      neverBundle: ["@healthzkit/shared", "healthzkit", "@aws-sdk/client-s3", "aws-sdk"],
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
