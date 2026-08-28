# Hello Workerサンプル

HTTPを持たず、`fixedDelay` Triggerだけで常駐するApplicationの最小例です。
Loutre CLIがApplicationをhostするのではなく、`src/main.ts`がHost entryとして`bootstrap()`とTrigger Engineの起動を所有します。

```sh
npm run dev --workspace @loutrejs/example-hello-worker
```

production相当の起動:

```sh
npm run start --workspace @loutrejs/example-hello-worker
```

起動直後と、その後5秒ごとに`Hello from worker!`を出力します。
