# PRism AI

PRism is a small MERN beta that turns a GitHub Pull Request into an evidence-backed review report.

## Stack

- MongoDB for persistence
- Express and Node.js for the API
- React with Vite for the dashboard
- Plain JavaScript for an easy-to-follow implementation

## Structure

```text
client/
  src/
    app/
    features/
server/
  src/
    features/
```

Each feature owns its routes, controllers, and UI where applicable. Shared code should be added only when more than one feature needs it.

## Run

```bash
npm run install:all
npm run dev
```

The client runs on `http://localhost:5173` and the API runs on `http://localhost:5000`.

## Delivery Rule

Work is delivered one small task at a time. Each completed task is validated and committed before the next task begins.