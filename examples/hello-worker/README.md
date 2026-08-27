# Hello Workerサンプル

HTTPを持たず、`fixedDelay` Triggerだけで常駐するApplicationの最小例です。

```sh
npm run dev --workspace @loutrejs/example-hello-worker
```

production相当の起動は次です。

```sh
npm run start --workspace @loutrejs/example-hello-worker
```

実体はそれぞれ次のCLI commandです。

```sh
loutre dev src/app.ts
loutre start src/app.ts
```

起動直後と、その後5秒ごとに`Hello from worker!`を出力します。
