FROM node:24-alpine

RUN apk add --no-cache git
RUN npm install -g corepack@latest
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY src ./src

CMD ["node", "src/index.js"]