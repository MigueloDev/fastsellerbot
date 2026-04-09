FROM node:24-alpine

RUN apk add --no-cache git
RUN npm install -g corepack@latest
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

RUN chown -R node:node /app
USER node

COPY --chown=node:node package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY --chown=node:node src ./src

CMD ["node", "src/index.js"]