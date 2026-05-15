import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Healthzkit",
  description:
    "Documentation for the healthzkit npm package — liveness and readiness probes for Node.js.",
  srcDir: "./src",
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Guide", link: "/guide/introduction", activeMatch: "^/guide/" },
      {
        text: "Adapters",
        items: [
          { text: "Redis", link: "/guide/adapters-redis" },
          { text: "Postgres", link: "/guide/adapters-postgres" },
        ],
      },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Introduction", link: "/guide/introduction" },
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Checks and adapters", link: "/guide/checks-and-adapters" },
          { text: "Scheduling", link: "/guide/scheduling" },
          { text: "Responses and HTTP", link: "/guide/responses-and-http" },
        ],
      },
      {
        text: "Adapters",
        items: [
          { text: "Redis", link: "/guide/adapters-redis" },
          { text: "Postgres", link: "/guide/adapters-postgres" },
        ],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/alasti-company" }],
  },
  sitemap: {
    hostname: "https://healthzkit.dev",
    lastmodDateOnly: true,
  },
});
