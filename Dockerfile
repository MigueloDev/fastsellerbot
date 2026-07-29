FROM node:24.18-alpine

RUN apk add --no-cache git
RUN npm install -g corepack@latest
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# so named volumes for node_modules / pnpm home init as node, not root
RUN mkdir -p /app/node_modules /home/node/.local/share/pnpm \
  && chown -R node:node /app /home/node

USER node

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./

ENV npm_config_store_dir=/home/node/.local/share/pnpm/store
RUN pnpm install --frozen-lockfile

COPY --chown=node:node src ./src

CMD ["node", "src/index.js"]