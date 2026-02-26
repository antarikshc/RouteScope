#!/bin/bash
set -e

cd "$(dirname "$0")"

# Check for .env
if [ ! -f .env ]; then
  echo "⚠  .env not found. Copying .env.example → .env"
  cp .env.example .env
  echo "   Fill in your API keys in .env before polling will work."
fi

# Install deps if missing
if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

PORT="${PORT:-3000}"
echo "🚀 Starting server on http://localhost:$PORT"

# Open browser after a short delay (macOS: open, Linux: xdg-open)
(sleep 2 && \
  if command -v open &>/dev/null; then open "http://localhost:$PORT"; \
  elif command -v xdg-open &>/dev/null; then xdg-open "http://localhost:$PORT"; \
  fi) &

npm start
