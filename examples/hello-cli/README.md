# Hello CLIサンプル

HostがCLI引数をparseし、Application Argumentsをbindしてpublic `Task`を1回だけ実行する最小例です。
Loutre自身はCLI構文を解釈しません。

```sh
npm run start --workspace @loutrejs/example-hello-cli
npm run start --workspace @loutrejs/example-hello-cli -- --name Loutre
```

出力:

```text
Hello, World!
Hello, Loutre!
```

`src/main.ts`がNode.jsの`parseArgs()`でHostを構成し、`bootstrap({ application, arguments })`から`app.run(hello)`を呼びます。
