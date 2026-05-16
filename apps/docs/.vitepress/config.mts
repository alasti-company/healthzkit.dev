import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Healthzkit",
  description: "Liveness and Readiness probes for Node.js.",
  srcDir: "./src",
  markdown: {
    theme: {
      light: "vitesse-light",
      dark: "vitesse-dark",
    },
    async shikiSetup(shiki) {
      await shiki.loadLanguage("html", "xml", "markdown");
    },
  },
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Guide", link: "/guide/introduction", activeMatch: "^/guide/" },
      {
        text: "Adapters",
        items: [
          { text: "Redis", link: "/guide/adapters-redis" },
          { text: "Postgres", link: "/guide/adapters-postgres" },
          { text: "MongoDB", link: "/guide/adapters-mongo" },
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
          { text: "MongoDB", link: "/guide/adapters-mongo" },
        ],
      },
    ],
    footer: {
      message: "Released under the AGPL-3.0 License.",
      copyright: `Copyright © ${new Date().getFullYear()} The Alasti Company & Healthzkit.dev`,
    },
    socialLinks: [{ icon: "github", link: "https://github.com/alasti-company/healthzkit.dev" }],
  },
  sitemap: {
    hostname: "https://healthzkit.dev",
    lastmodDateOnly: true,
  },
});
