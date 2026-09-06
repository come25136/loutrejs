# Hello Worker Example

A minimal long-running Application with no HTTP server and only a `fixedDelay` Trigger.

The Trigger Engine has not been migrated to the Execution Extension contract in this PR. To keep the existing worker API and behavior stable, this example intentionally continues to use the legacy Host entry point: `src/main.ts` owns both `bootstrap()` and Trigger Engine startup. HTTP, WebSocket, Tasks, and MessagePort use the new Execution Extension boundary independently of this compatibility path.

From this example directory, start the worker in development mode:

```sh
npm run dev
```

For a production-style start:

```sh
npm run start
```

The worker prints `Hello from worker!` immediately after startup and then every five seconds.
