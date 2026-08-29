# ADR: Framework-owned Startup Presentation

- Status: Proposed
- Date: 2026-08-29
- Target PR: https://github.com/come25136/loutrejs/pull/24
- Target branch: `fix/restore-startup-banner`

## Context

Loutre の Node.js / Bun / Deno 向け `serve()` では、Application 起動時に startup presentation を表示する。

想定する表示は次のようなものとする。

```text
╭──────────────────────────────────────────────────────────────────────╮
│                                                                      │
│                         LOUTRE ASCII LOGO                             │
│                                                                      │
│                        ʕ•ᴥ•ʔ  Loutre 0.1.0                           │
│                                                                      │
│        Server        http://127.0.0.1:3001                           │
│        Runtime       Node.js 26.1.0                                  │
│        Environment   development                                     │
│                                                                      │
╰──────────────────────────────────────────────────────────────────────╯

  ✓ Ready in 42 ms
```

PR #24 では startup presentation の ownership を Framework 側へ戻す変更を進めているが、途中実装では generated Host が presentation 用 metadata や Loutre version を保持する構造が混在している。

例えば次のようなコードは、Application / generated Host が presentation の都合を知るため責務分離として望ましくない。

```ts
await nodeRuntime.serve({
  application,
  hostname: '127.0.0.1',
  presentation: {
    application: 'Loutre Application',
    version: '0.1.0',
  },
})
```

また、generated Host が `renderStartupPrelude()` / `renderStartupStatus()` を直接呼ぶ構造も採用しない。

startup presentation は Application source や generated Host ではなく、Framework と Runtime Adapter が所有する。

## Decision

### 1. `serve()` が startup presentation lifecycle を所有する

Application 開発者は presentation を設定しない。

```ts
const server = await nodeRuntime.serve({
  application,
  hostname: '127.0.0.1',
})
```

この呼び出しだけで Framework 側が次を行う。

1. Loutre logo / version を表示する
2. Application を initialize する
3. Server を listen する
4. listen 成功後に Server / Runtime / Environment を表示する
5. `Ready` を表示する

generated Host は startup presentation に関する情報を一切所有しない。

### 2. `Application` metadata は表示しない

今回の ADR では Application identity を扱わない。

次の行は削除する。

```text
Application   Loutre Application
```

`ApplicationDefinition.name` などの Application identity API も追加しない。

Application identity は Graph / logging / observability など、startup presentation 以外にも意味を持つ必要が出た時点で別 ADR として設計する。

startup presentation のためだけに Application name API を追加しない。

### 3. startup metadata の ownership を分離する

| Metadata                      | Owner              |
| ----------------------------- | ------------------ |
| Loutre version                | Loutre Core        |
| Server URL                    | Runtime Adapter    |
| Runtime                       | Runtime Adapter    |
| Environment                   | Runtime Adapter    |
| Startup duration              | Runtime Adapter    |
| Logo / frame / color / layout | Presentation layer |

generated Host はこれらを保持しない。

### 4. Presentation layer は描画だけを担当する

Presentation layer は Node.js / Bun / Deno 固有 API を直接参照しない。

Runtime Adapter が runtime 固有情報を収集し、Presentation layer へ事実として渡す。

内部 API は概ね次の責務分割とする。

```ts
const presentation = startStartupPresentation({
  version: LOUTRE_VERSION,
})

presentation.ready({
  server: 'http://127.0.0.1:3001',
  runtime: 'Node.js 26.1.0',
  environment: 'development',
  startupDurationMs: 42,
})
```

型イメージ:

```ts
export interface StartupPresentationInfo {
  readonly version: string
}

export interface StartupStatusInfo {
  readonly server: string
  readonly runtime: string
  readonly environment: string
  readonly startupDurationMs: number
}

export interface StartupPresentationSession {
  ready(info: StartupStatusInfo): void
}
```

`application` field は持たない。

また、listen 前には Server URL がまだ確定していないため、`startStartupPresentation()` へ `server` を渡さない。

### 5. startup lifecycle

startup presentation は次の時系列で動作する。

```text
serve()
  │
  ├─ startup timer start
  │
  ├─ presentation.start()
  │      │
  │      └─ Loutre logo
  │         Loutre version
  │
  ├─ binding.host(...)
  │
  ├─ application.init()
  │
  ├─ triggers.start()
  │
  ├─ listen()
  │
  ├─ listen success
  │
  └─ presentation.ready(...)
         │
         ├─ Server
         ├─ Runtime
         ├─ Environment
         └─ ✓ Ready
```

listen に失敗した場合、`presentation.ready()` へ到達してはいけない。

したがって listen 失敗時には次を表示しない。

```text
Server
Runtime
Environment
✓ Ready
```

logo / Loutre version は listen 開始前に表示されていてよい。

### 6. Loutre version は Framework 自身が所有する

Loutre version を generated project 側から注入しない。

次のような template variable は削除する。

```text
{{loutreVersion}}
```

create-loutre が `@loutrejs/loutre` dependency version を解析し、presentation 用 version として Host template に埋め込む設計も削除する。

Loutre package 自身が自分の version を所有する。

推奨例:

```ts
export const LOUTRE_VERSION = '0.1.0'
```

build 時に生成する internal module へ version を埋め込む。

例:

```text
packages/loutre/src/generated/version.ts
```

または同等の内部 module とする。

runtime で `package.json` を filesystem から読む設計にはしない。

理由:

- Node.js filesystem への依存を避ける
- Bun / Deno portability を維持する
- bundle された場合にも安定して動作する
- package export resolution や runtime path に依存しない

### 7. Runtime Adapter が runtime metadata を収集する

#### Node.js

```ts
{
  server: serverUrl(hostname, actualPort),
  runtime: `Node.js ${process.versions.node}`,
  environment: process.env.NODE_ENV ?? 'development',
}
```

#### Bun

```ts
{
  server: serverUrl(hostname, actualPort),
  runtime: `Bun ${Bun.version}`,
  environment: Bun.env.NODE_ENV ?? 'development',
}
```

#### Deno

```ts
{
  server: serverUrl(hostname, actualPort),
  runtime: `Deno ${Deno.version.deno}`,
  environment:
    Deno.env.get('DENO_ENV') ??
    Deno.env.get('NODE_ENV') ??
    'development',
}
```

Deno では `Deno.serve()` の標準 Listening message を抑止し、Loutre の startup presentation を startup output とする。

### 8. port 省略時のみ auto increment する

port が省略された場合は 3000 から開始する。

```text
3000
 ↓ EADDRINUSE
3001
 ↓ EADDRINUSE
3002
 ↓ success
```

`EADDRINUSE` の場合のみ次の port へ retry する。

最終的に listen 成功した実 port を startup presentation に表示する。

```text
Server   http://localhost:3002
```

### 9. port 明示時は絶対に retry しない

明示 port の場合:

```ts
nodeRuntime.serve({
  application,
  port: 3000,
})
```

3000 が使用中なら `EADDRINUSE` をそのまま caller へ伝播する。

3001 以降へ fallback してはいけない。

```text
explicit port
      │
      ├─ listen success
      │
      └─ listen failure
             │
             └─ throw
```

Node / Bun / Deno すべて同じ挙動にする。

実装上は既存の次の条件を維持する。

```ts
if (requestedPort !== undefined || !canRetryOnNextPort(error, port)) {
  throw error
}
```

## Public API

### Node.js

```ts
await nodeRuntime.serve({
  application,
  hostname: '127.0.0.1',
})
```

### Bun

```ts
await bunRuntime.serve({
  application,
  hostname: '127.0.0.1',
})
```

### Deno

```ts
await denoRuntime.serve({
  application,
  hostname: '127.0.0.1',
})
```

`presentation` option は公開 API へ追加しない。

作業途中で追加されている場合は削除する。

## Generated Host

create-loutre が生成する Host は presentation を一切知らない。

`SIGINT` / `SIGTERM` の購読と `close(signal)` への伝播も Runtime Adapter が所有する。generated Host はruntimeごとのshutdown APIを知らない。

### Node

```ts
import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

await nodeRuntime.serve({ application })
```

### Bun

```ts
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import application from './app.js'

await bunRuntime.serve({ application })
```

### Deno

```ts
import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import application from './app.ts'

await denoRuntime.serve({ application })
```

generated Host から以下をすべて削除する。

- `@loutrejs/loutre/presentation` import
- `renderStartupPrelude`
- `renderStartupStatus`
- `detectPresentationTerminal`
- `presentation` serve option
- `application: 'Loutre Application'`
- `{{loutreVersion}}`
- Runtime version 取得処理
- Environment 表示用処理
- startup timer

## Output

### TTY

```text
╭──────────────────────────────────────────────────────────────────────╮
│                                                                      │
│                         LOUTRE ASCII LOGO                             │
│                                                                      │
│                        ʕ•ᴥ•ʔ  Loutre 0.1.0                           │
│                                                                      │
│        Server        http://127.0.0.1:3001                           │
│        Runtime       Node.js 26.1.0                                  │
│        Environment   development                                     │
│                                                                      │
╰──────────────────────────────────────────────────────────────────────╯

  ✓ Ready in 42 ms
```

### non-TTY

```text
Loutre 0.1.0
Server: http://127.0.0.1:3001
Runtime: Node.js 26.1.0
Environment: development
Ready in 42 ms
```

以下は表示しない。

```text
Application
typed · modular · fast
```

## Scope

対象:

- Node.js
- Bun
- Deno

対象外:

- Cloudflare Workers
- AWS Lambda

Cloudflare Workers / AWS Lambda は process startup と request lifecycle が一致しないため、自動 startup presentation を追加しない。

## Tests

### Presentation tests

Prelude:

- logo が表示される
- Loutre version が表示される
- Server は表示されない
- Runtime は表示されない
- Environment は表示されない
- Ready は表示されない
- Application は表示されない

Status:

- Server が表示される
- Runtime が表示される
- Environment が表示される
- Ready が表示される
- Application は表示されない

Full frame:

- prelude + status を順に出力すると `╭` と `╰` がそれぞれ 1 回だけ存在する
- `typed · modular · fast` を含まない

non-TTY:

```text
Loutre <version>
Server: ...
Runtime: ...
Environment: ...
Ready in ...
```

となること。

### Runtime tests

Node / Bun / Deno すべてで以下を検証する。

#### Default port retry

3000 と 3001 を使用中にする。

```text
3000 occupied
3001 occupied
3002 free
```

port 未指定で `serve()` した場合、3002 で listen すること。

startup output の Server も 3002 になること。

#### Explicit port failure

3000 を使用中にする。

```ts
serve({
  application,
  port: 3000,
})
```

期待値:

```text
listen attempts = [3000]
```

のみ。

3001 へ retry しない。

`EADDRINUSE` を caller へ返す。

`Ready` を表示しない。

### Type tests

Runtime API へ presentation customization を公開しない。

次のようなコードは型エラーになること。

```ts
nodeRuntime.serve({
  application,
  presentation: {
    version: '0.1.0',
  },
})
```

Bun / Deno も同様。

Presentation 内部型から `application` を削除する。

### create-loutre tests

生成された Node / Bun / Deno `main.ts` に以下が存在しないこと。

```text
presentation
renderStartupPrelude
renderStartupStatus
detectPresentationTerminal
Loutre Application
{{loutreVersion}}
```

create-loutre の starter 処理から以下を削除する。

- presentation 用 version 抽出処理
- `presentationVersion()`
- `src/main.ts` への `loutreVersion` template rendering

ただし package dependency として利用する `@loutrejs/loutre` version の決定処理は維持する。

## Consequences

### Positive

- generated Host が Framework の表示仕様から独立する
- `serve()` を直接利用するユーザーにも同じ startup UX を提供できる
- Node / Bun / Deno で startup lifecycle を統一できる
- listen 成功前に未確定の Server URL を presentation へ渡す必要がなくなる
- create-loutre が Loutre version の presentation responsibility を持たなくなる
- Application identity を startup banner の都合だけで API に追加せずに済む

### Negative

- Runtime Adapter は terminal capability と runtime metadata を Presentation layer へ渡す責務を持つ
- Loutre version を build artifact へ埋め込む仕組みが必要になる
- `serve()` が output side effect を持つことになる

この side effect は long-lived local server lifecycle の標準 UX として許容する。

## Rejected Alternatives

### Generated Host が presentation を描画する

却下。

理由:

- generated Host が Framework の UI detail を知る
- create-loutre と runtime API 利用者で挙動が分かれる
- version / runtime / environment 取得処理が template へ漏れる

### `presentation` option を public API として渡す

却下。

理由:

- 標準 Framework UX であり、Application developer が設定する情報ではない
- ownership が Host / Application 側へ逆流する

### `ApplicationDefinition.name` を追加する

今回は却下。

Application identity 自体に独立したユースケースが生まれた時点で別 ADR とする。

### runtime で `package.json` を読み Loutre version を取得する

却下。

filesystem / runtime path / bundler への不要な依存を作るため。

## Acceptance Criteria

1. `nodeRuntime.serve({ application })` だけで startup presentation が出る
2. `bunRuntime.serve({ application })` だけで startup presentation が出る
3. `denoRuntime.serve({ application })` だけで startup presentation が出る
4. generated Host に presentation code がない
5. generated Host に Loutre version 埋め込みがない
6. `Application` 行が存在しない
7. Server / Runtime / Environment は listen 成功後のみ表示される
8. listen 失敗時に Ready が出ない
9. port 省略時だけ `EADDRINUSE` で auto increment する
10. port 明示時は 1 度だけ listen し、失敗をそのまま返す
11. Node / Bun / Deno で挙動が一致する
12. Cloudflare Workers / AWS Lambda の挙動を変えない
13. formatter / lint / typecheck / tests / build を通す

## Implementation Notes for Codex

PR #24 の既存 branch `fix/restore-startup-banner` 上で実装する。

既存の未コミット差分がある場合は捨てずに内容を確認し、本 ADR と整合するものは利用する。

優先順:

1. Presentation 内部 API を整理
2. `Application` metadata を削除
3. Loutre version を Framework ownership へ移動
4. Node Runtime へ自動 presentation を統合
5. Bun Runtime へ自動 presentation を統合
6. Deno Runtime へ自動 presentation を統合
7. generated Host から presentation 責務を削除
8. create-loutre の version template 処理を削除
9. explicit port non-retry をテストで固定
10. relevant tests を更新
11. formatter / lint / typecheck / tests / build を実行

git 操作はローカルの編集・検証がすべて完了してから行う。

CI を不要に何度も起動しないため、途中経過ごとの commit / push は行わない。

最終確認後にまとめて commit / push する。
