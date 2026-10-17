# Hello Worker Example

A minimal long-running Application using the official Tasks Execution Extension.

Only the `fixedDelay` Trigger is registered in `Module.executions`. The referenced `hello` Task is automatically included in the Application Model. `src/main.ts` boots with `nodeRuntime.create()` and starts the Trigger with `app.tasks.start()`. The Node Runtime manages Task shutdown and the exit lifecycle on SIGINT or SIGTERM.

From this example directory, start the worker in development mode:

```sh
npm run dev
```

For a production-style start:

```sh
npm run start
```

The worker prints `Hello from worker!` immediately after startup and then every five seconds.
