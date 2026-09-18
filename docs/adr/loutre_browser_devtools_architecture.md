# Loutre Browser DevTools Architecture

- Status: **Accepted**
- Date: 2026-09-13
- Updated: 2026-09-17
- Scope: CLI tooling / local runtime instrumentation / 公式サイト

## Context

DevTools専用desktop applicationを正本にすると、公式サイトが持つNext.js、React、theme、navigationなどのWeb資産を共有できず、配布と更新の責務も増える。一方、公式サイトはGitHub Pagesへのstatic exportを維持するため、project固有のApplication Definitionやruntime instanceをremote serverで評価できない。

また、Graphの可視化だけではruntime debuggingに不足する。HTTP、Task、MessagePort、WebSocket、Provider methodなどの実行をApplication Model上のnodeへ対応付け、Trace、Replay、Provider PlaygroundをBrowserと将来のAgent/MCP clientから同じprotocolで操作できる必要がある。

## Decision

`DevtoolsModule()`をApplication側の明示的なopt-inとし、`loutre dev --entry <entry> -- <application command>`がlocal Dev serverとApplication processをまとめて起動する。`DevtoolsModule()`はserverを起動せず、capture / replay policyだけをApplication Modelへ提供する。

```text
                        ┌────────────────────────────┐
Browser / Agent ───────▶│ /__loutre/client          │
                        │ structured Control Plane   │
                        │                            │
Application process ───▶│ /__loutre/app             │
                        │ runtime event / command    │
                        └─────────────┬──────────────┘
                                      │
                              loutre dev (CLI)
                                      │
                         Application Model / Graph
```

BrowserとAgentは同じControl Planeを使う。Graph取得・reload、Trace一覧・取得、Replay、Provider PlaygroundなどのsemanticsをWebsite固有APIへ置かず、structured command/event protocolを正本とする。

Application runtime channelはControl Planeとは物理的に分ける。Application processはruntime eventをbatchでpushし、ReplayやProvider invocationなどのcommandを受ける。Node adapterはtransportだけを所有し、instrumentation lifecycleはApplication Kernelが所有する。

source変更はCLIが監視し、Application Definitionのbundle dependencyからproject-owned watch対象を求める。Graph再構築に失敗した場合は直前の有効なSnapshotを保持し、errorだけを更新する。

protocolにはnpm package versionと独立した`DEVTOOLS_PROTOCOL_VERSION`を持たせる。

## Runtime boundary

Core RuntimeはDevTools固有のTrace形式を知らず、genericな`RuntimeInstrumentation` boundaryだけを提供する。Execution Extensionは自分が所有するexecution semanticsをmetadataとしてKernelへ渡す。

- Kernel: execution lifetime、generic instrumentation、Provider creation notificationを所有する。
- HTTP / Tasks / MessagePort / WebSocket: execution / operationの意味と入力を所有する。
- `@loutrejs/loutre/devtools`: Trace、capture、Replay capsule、Provider Playgroundを実装する。
- Node adapter: AsyncLocalStorageとlocal WebSocket transportを提供する。
- CLI: Graph projection、watch、Control Plane、Application channel、event storeを提供する。

Instrumentationはbest-effortであり、observerやtransportの失敗がApplicationのDI、execution、shutdown semanticsを変えてはならない。

## Security boundary

Dev serverは`127.0.0.1`だけにbindし、LANへ公開しない。HTTP/WebSocket requestはloopback Hostを検証する。

Browser Control WebSocketは許可Originを検証する。公式サイトとlocal website開発環境を既定で許可し、追加OriginはCLI optionで明示する。native Agent clientはloopback接続ならOriginなしで接続できる。

Application channelはloopbackかつBrowser Originなしの接続だけを受け付ける。Browser用tokenやsession handshakeをsecurity boundaryにはしない。

CLIは対象Application Definitionをローカルで評価するため、信頼していないprojectで`loutre dev`を実行しない。Websiteへlive handler、Provider instance、native resourceを渡さない。

## Website boundary

公式サイトは引き続きstatic exportとする。動的な状態を所有するのはlocal Dev serverであり、WebsiteはControl Planeへ接続するclient-side applicationとして動作する。

Graph canvasにはReact Flow、階層layoutにはELKを使う。Runtime viewはTrace / Waterfall / Replay / Provider Playgroundを同じlocal sessionから表示する。Electron preload APIやNode.js APIへ依存しない。

## Alternatives

### Application Definitionを公式サイトへuploadする

採用しない。TypeScript codeのremote execution、dependency解決、secret混入、保存期間という新しいsecurity boundaryが生じる。

### Electron applicationを正本にする

採用しない。Web標準だけで成立するUIにdesktop shellを必須とすると、公式サイトとの資産共有とrelease lifecycleが分断される。

### Graph更新だけSSE、操作はHTTPに分ける

採用しない。Trace、Replay、Provider Playground、将来のAgent操作まで含めると双方向command/eventが必要になるため、Control Planeを単一WebSocketへ統一する。

## Consequences

- Browserと将来のAgent/MCP adapterが同じstructured protocolを利用できる。
- Application Modelとruntime Traceを同じGraph identityで接続できる。
- DevToolsの失敗をApplication runtime semanticsから隔離する必要がある。
- protocol compatibilityをnpm versionとは独立して管理する必要がある。
- loopback accessとBrowser Origin policyを継続して検証する必要がある。
