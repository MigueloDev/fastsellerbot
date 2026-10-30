#!/bin/sh
set -e
pnpm db:migrate:deploy
exec node src/index.js
