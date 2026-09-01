# Hello Worker Example

A minimal long-running Application with no HTTP server and only a `fixedDelay` Trigger. The Loutre CLI does not host the Application; `src/main.ts` is the Host entry point and owns both `bootstrap()` and Trigger Engine startup.

From this example directory, start the worker in development mode:

```sh
npm run dev
```

For a production-style start:

```sh
npm run start
```

The worker prints `Hello from worker!` immediately after startup and then every five seconds.
