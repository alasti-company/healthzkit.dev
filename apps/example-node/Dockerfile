# Build from the repository root: docker build -f apps/example-node/Dockerfile -t healthzkit-example:local .
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@12.3.4
COPY . .
# This subset uses prebuilt tooling; skip repository git-hook setup inside the image.
RUN pnpm install --filter '@healthzkit/example-node...' --frozen-lockfile --ignore-scripts \
    && pnpm exec vp run --filter '@healthzkit/example-node...' build \
    && pnpm --filter @healthzkit/example-node --legacy deploy --prod /app

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app .
USER node
EXPOSE 3000
CMD ["node", "dist/index.mjs"]
