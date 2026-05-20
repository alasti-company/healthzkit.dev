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
          {
            text: "Queues",
            items: [{ text: "RabbitMQ", link: "/adapter/rabbitmq" }],
          },
          {
            text: "Databases",
            items: [
              { text: "Redis", link: "/adapter/redis" },
              { text: "Postgres", link: "/adapter/postgres" },
              { text: "MySQL", link: "/adapter/mysql" },
              { text: "MongoDB", link: "/adapter/mongo" },
              { text: "SQLite", link: "/adapter/sqlite" },
              { text: "DynamoDB", link: "/adapter/dynamo" },
            ],
          },
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
          { text: "Framework guides", link: "/guide/frameworks" },
          { text: "Responses and HTTP", link: "/guide/responses-and-http" },
        ],
      },
      {
        text: "Adapters",
        items: [
          {
            text: "Queues",
            items: [{ text: "RabbitMQ", link: "/adapter/rabbitmq" }],
          },
          {
            text: "Databases",
            items: [
              { text: "Redis", link: "/adapter/redis" },
              { text: "Postgres", link: "/adapter/postgres" },
              { text: "MySQL", link: "/adapter/mysql" },
              { text: "MongoDB", link: "/adapter/mongo" },
              { text: "SQLite", link: "/adapter/sqlite" },
              { text: "DynamoDB", link: "/adapter/dynamo" },
            ],
          },
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
  head: [
    [
      "script",
      {
        defer: "",
        src: "https://assets.onedollarstats.com/stonks.js",
        "data-hostname": "healthzkit.dev",
      },
    ],
  ],
});
