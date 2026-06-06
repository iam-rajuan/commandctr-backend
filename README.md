# CommandCtr Backend

Production-grade modular backend foundation for the CommandCtr multi-channel e-commerce operating system.

## Tech Stack

- Node.js
- Express.js
- TypeScript
- MongoDB with Mongoose
- Pino
- Zod
- Vitest

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
copy .env.example .env
```

3. Update `.env` with your local MongoDB URI and any service credentials.

## Development

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Start the compiled server:

```bash
npm run start
```

## Health Endpoint

After the server is running, test the health route:

```bash
curl http://localhost:5000/api/v1/health
```

Expected shape:

```json
{
  "success": true,
  "message": "CommandCtr API is healthy",
  "data": {
    "service": "CommandCtr Backend",
    "status": "ok",
    "timestamp": "ISO_DATE",
    "uptime": 123
  }
}
```

## Project Structure

Future modules belong under `src/modules/<module-name>`. Each module should keep its own route, controller, service, model, validation, and related files.

## Available Scripts

- `npm run dev` starts the development server with `tsx`.
- `npm run build` compiles TypeScript and rewrites path aliases.
- `npm run start` runs the compiled app from `dist`.
- `npm run lint` runs ESLint.
- `npm run format` formats the codebase with Prettier.
- `npm run test` runs Vitest once.
