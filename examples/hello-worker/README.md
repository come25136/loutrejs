# Hello Worker Example

A minimal long-running Application using the official Tasks Execution Extension.

Only the `fixedDelay` trigger is registered in `Module.executions`; its referenced `hello` Task is included automatically in the Application Model. `src/main.ts` starts the portable Kernel Application with `bootstrapApplication()` and starts trigger execution through `app.tasks.start()`.

From this example directory, start the worker in development mode:

```sh
npm run dev
```

For a production-style start:

```sh
npm run start
```

The worker prints `Hello from worker!` immediately after startup and then every five seconds.
