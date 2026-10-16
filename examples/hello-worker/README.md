# Hello Worker Example

A minimal long-running Application using the official Tasks Execution Extension.

`Module.executions`へ登録するのは`fixedDelay` Triggerだけです。参照先の`hello` TaskはApplication Modelへ自動で含まれます。`src/main.ts`は`nodeRuntime.create()`で起動し、`app.tasks.start()`でTriggerを開始します。SIGINT / SIGTERMによるTask停止と終了lifecycleはNode Runtimeが管理します。

From this example directory, start the worker in development mode:

```sh
npm run dev
```

For a production-style start:

```sh
npm run start
```

The worker prints `Hello from worker!` immediately after startup and then every five seconds.
