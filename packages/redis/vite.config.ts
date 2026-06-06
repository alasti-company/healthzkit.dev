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
    entry: ["src/index.ts", "src/ioredis.ts", "src/redis.ts", "src/upstash.ts"],
    treeshake: true,
    minify: true,
    deps: {
      neverBundle: ["ioredis", "redis", "@upstash/redis", "healthzkit"],
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
