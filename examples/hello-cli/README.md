# Hello CLIサンプル

manual `entrypoint`を1回だけ実行して終了するone-shot Applicationの最小例です。
HTTP listenerもTriggerも起動しません。

```sh
npm run start --workspace @loutrejs/example-hello-cli
```

出力:

```text
Hello, World!
```

実体は次のCLI commandです。

```sh
loutre run src/app.ts
```
