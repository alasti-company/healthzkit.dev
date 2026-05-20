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
    entry: ["./src/index.ts", "./src/amqplib.ts", "./src/amqp-connection-manager.ts"],
    treeshake: true,
    minify: true,
    deps: {
      neverBundle: ["healthzkit", "amqplib", "amqp-connection-manager"],
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
