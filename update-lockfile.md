docker run --rm -v $(pwd):/app -w /app node:24-alpine sh -c "
  apk add --no-cache git &&
  npm install -g corepack@latest &&
  corepack enable &&
  corepack prepare pnpm@latest --activate &&
  pnpm install
"