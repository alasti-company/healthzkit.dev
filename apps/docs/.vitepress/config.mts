import { defineConfig } from "vitepress";
import type { HeadConfig } from "vitepress";

const siteUrl = "https://healthzkit.dev";
const siteDescription =
  "Framework-agnostic liveness and readiness probes for Node.js. Parallel checks, rollup status, HTTP mapping, optional scheduling, and adapters for Redis, Postgres, MySQL, MongoDB, SQLite, DynamoDB, and RabbitMQ.";

function pagePath(relativePath: string): string {
  const slug = relativePath.replace(/\.md$/, "").replace(/(^|\/)index$/, "");
  return slug ? `/${slug}` : "/";
}

const faviconHead: HeadConfig[] = [
  [
    "link",
    {
      rel: "icon",
      type: "image/png",
      sizes: "50x50",
      href: "/favicon-light-50.png",
      media: "(prefers-color-scheme: light)",
    },
  ],
  [
    "link",
    {
      rel: "icon",
      type: "image/png",
      sizes: "100x100",
      href: "/favicon-light-100.png",
      media: "(prefers-color-scheme: light)",
    },
  ],
  [
    "link",
    {
      rel: "icon",
      type: "image/png",
      sizes: "50x50",
      href: "/favicon-dark-50.png",
      media: "(prefers-color-scheme: dark)",
    },
  ],
  [
    "link",
    {
      rel: "icon",
      type: "image/png",
      sizes: "100x100",
      href: "/favicon-dark-100.png",
      media: "(prefers-color-scheme: dark)",
    },
  ],
  [
    "link",
    {
      rel: "icon",
      type: "image/png",
      sizes: "100x100",
      href: "/favicon-light-100.png",
    },
  ],
  [
    "link",
    {
      rel: "apple-touch-icon",
      sizes: "100x100",
      href: "/favicon-light-100.png",
    },
  ],
];

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: "en-US",
  title: "Healthzkit",
  titleTemplate: ":title | Healthzkit",
  description: siteDescription,
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
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/alasti-company/healthzkit.dev",
      },
    ],
  },
  sitemap: {
    hostname: siteUrl,
    lastmodDateOnly: true,
  },
  transformHead({ pageData, siteData }) {
    const canonical = `${siteUrl}${pagePath(pageData.relativePath)}`;
    const pageTitle =
      pageData.frontmatter.titleTemplate === false && pageData.title
        ? pageData.title
        : pageData.title
          ? `${pageData.title} | ${siteData.title}`
          : (siteData.title ?? "Healthzkit");
    const pageDescription = pageData.description ?? siteData.description ?? siteDescription;
    const ogImage = `${siteUrl}/favicon-light-100.png`;

    return [
      ["link", { rel: "canonical", href: canonical }],
      ["meta", { property: "og:url", content: canonical }],
      ["meta", { property: "og:title", content: pageTitle }],
      ["meta", { property: "og:description", content: pageDescription }],
      ["meta", { property: "og:image", content: ogImage }],
      ["meta", { name: "twitter:title", content: pageTitle }],
      ["meta", { name: "twitter:description", content: pageDescription }],
      ["meta", { name: "twitter:image", content: ogImage }],
    ];
  },
  head: [
    ...faviconHead,
    ["meta", { name: "author", content: "The Alasti Company" }],
    [
      "meta",
      {
        name: "keywords",
        content:
          "healthzkit, health check, liveness probe, readiness probe, kubernetes, node.js, express, fastify, hono, redis, postgres, mysql, mongodb",
      },
    ],
    ["meta", { name: "robots", content: "index, follow" }],
    ["meta", { property: "og:site_name", content: "Healthzkit" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:locale", content: "en_US" }],
    ["meta", { name: "twitter:card", content: "summary" }],
    [
      "meta",
      {
        name: "theme-color",
        content: "#ffffff",
        media: "(prefers-color-scheme: light)",
      },
    ],
    [
      "meta",
      {
        name: "theme-color",
        content: "#000000",
        media: "(prefers-color-scheme: dark)",
      },
    ],
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
