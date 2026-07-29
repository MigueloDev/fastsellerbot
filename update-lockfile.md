docker run --rm -e CI=true -v "$(pwd):/app" -w /app node:24.18-alpine sh -c "
  apk add --no-cache git &&
  npm install -g corepack@latest &&
  corepack enable &&
  corepack prepare pnpm@11.16.0 --activate &&
  pnpm install
"