# Skamkraft

Web interface for [SpaceTraders](https://spacetraders.io/) — manage your fleet, explore systems in 3D, trade, mine, and run contracts from a single Angular app.

## Prerequisites

- Node.js 22+
- npm 11+
- A [SpaceTraders](https://spacetraders.io/) account and agent token

## Getting started

```bash
npm install
npm start
```

Open [http://localhost:4200](http://localhost:4200).

## SpaceTraders token

1. Create an agent at [spacetraders.io](https://spacetraders.io/) (use the quickstart link on the login screen).
2. Copy your **agent token** from the quickstart response.
3. Paste it on the **Login** screen. Enable **Remember me** to persist the token in `localStorage`; otherwise it is kept for the browser session only.

To register a new agent from the app, go to **Register** and provide your **account token** (from the SpaceTraders account page), an agent name, and a recruiting faction.

Tokens are stored locally in the browser and sent as `Authorization: Bearer` headers to `https://api.spacetraders.io/v2`. They are never committed to the repository.

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Dev server (`ng serve`) |
| `npm test` | Unit tests via Angular CLI |
| `npm run test:ci` | Unit tests via Vitest (used in CI) |
| `npm run build` | Production build |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting without writing |
| `npm run mcp:install` | Install the SpaceTraders MCP server dependencies |
| `npm run mcp:build` | Build the MCP server |
| `npm run generate:api-endpoints` | Regenerate API endpoint metadata from the OpenAPI spec |

## MCP server (optional)

The `mcp/spacetraders-server` package exposes SpaceTraders API tools for Cursor and other MCP clients. After `npm run mcp:install`, set `SPACETRADERS_TOKEN` in the MCP server environment to authenticate API calls.

## CI

GitHub Actions runs `npm ci` and `npx vitest run` on every push and pull request (see [`.github/workflows/test.yml`](.github/workflows/test.yml)).

Run the same checks locally:

```bash
npm run test:ci
```

## Coding agents

Project-scoped Codex agents help with architecture, Angular UI, SpaceTraders API and
state, Three.js, and tests/review. See [AGENTS.md](AGENTS.md) for their roles and the
shared coding instructions, and [CLAUDE.md](CLAUDE.md) for Claude Code specifics.

## Deploy on Render

Skamkraft is a static Angular SPA. Deploy it as a **Static Site** on [Render](https://render.com/):

| Setting | Value |
|---------|-------|
| Build command | `npm ci && npm run build` |
| Publish directory | `dist/skamkraft/browser` |

Add a **Rewrite rule** so client-side routing works:

| Source | Destination |
|--------|-------------|
| `/*` | `/index.html` |

No server-side environment variables are required for the frontend — users authenticate with their own SpaceTraders token in the browser.
