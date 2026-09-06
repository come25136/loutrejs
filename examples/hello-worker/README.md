# Hello Worker Example

A minimal long-running Application using the official Tasks Execution Extension.

`hello` and the `fixedDelay` trigger are registered in `Module.executions`. `src/main.ts` starts the portable Kernel Application with `bootstrapApplication()` and starts triggers through `app.tasks.triggers.start()`.

From this example directory, start the worker in development mode:

```sh
npm run dev
```

For a production-style start:

```sh
npm run start
```

The worker prints `Hello from worker!` immediately after startup and then every five seconds.
