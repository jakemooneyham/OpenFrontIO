# Repository Overview: OpenFrontIO

This project contains the source for **OpenFrontIO**, a browser based real-time strategy game. It is implemented mostly in TypeScript and split across a client, shared core, and server.

## Directory layout

- `src/client` – Frontend game logic and rendering using `pixi.js`. Includes the `ClientGameRunner`, input handling, UI components and the logic to connect to the server.
- `src/core` – Shared game logic and configuration. Contains the game engine (`game` folder), configuration objects, schemas used for messages between client and server, and utility functions.
- `src/server` – Node.js server. Uses Express and WebSockets and runs in a cluster (`Master.ts` + `Worker.ts`). Each `GameServer` instance handles a single match and maintains connected clients.
- `resources` – Static assets (maps, images, translations, quick chat presets and more). These are served with nginx when running in Docker.
- `tests` – Jest tests covering game logic. The `tests/util` directory contains helpers used to create games for unit tests.

Other root scripts include Docker build files, configuration for webpack, ESLint, Husky, etc.

## Common tasks

Install dependencies:

```bash
npm i
```

Run development mode (client + server with hot reload):

```bash
npm run dev
```

Build a production bundle:

```bash
npm run build-prod
```

Run only the server in development mode:

```bash
npm run start:server-dev
```

Run only the client:

```bash
npm run start:client
```

Run tests:

```bash
npm test
```

Lint and format code:

```bash
npm run lint
npm run lint:fix
npm run format
```

## Environment

The repository includes `example.env` that lists required environment variables (admin tokens, Cloudflare IDs, R2 credentials, etc.). Copy it to `.env` and fill in your values when deploying.

## Notes

- The server runs in a master/worker cluster. The master schedules public games and manages workers. Each worker hosts games and exposes API endpoints for joining games, starting lobbies, archiving replays and more.
- Game configuration lives in `src/core/configuration`. Different configs exist for dev, preprod and prod.
- Assets are served from `static` when packaged in Docker. The Docker image also launches nginx and supervisord via `startup.sh`.
- Code in `src/core` is licensed MIT; client code is GPLv3; assets in `resources/non-commercial` follow CC BY-NC 4.0 with an OpenFront LLC commercial exemption. See `README.md` and `LICENSE` for details.

