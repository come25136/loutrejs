# Loutre Browser Devtools Architecture

- Status: **Accepted**
- Date: 2026-09-13
- Scope: CLI tooling / 公式サイト / Application Graph visualization

## Context

Application Graphを探索する既存DevtoolsはElectron applicationとして実装されている。Electron Main processが対象projectの`@loutrejs/cli`をchild processで実行し、IPC経由でRendererへGraph Snapshotを渡す構成は、project codeとUIのprocess境界を保てる一方、次の制約を持つ。

- Devtools専用のdesktop applicationを配布・更新する必要がある。
- 公式サイトが持つNext.js、React、Tailwind CSS、theme、navigationなどのWeb資産を共有できない。
- Graph UIの改善が公式サイトと独立したrelease lifecycleになる。

公式サイトはGitHub Pagesへstatic exportする既存方針を維持するため、project固有のApplication Definitionを公式site buildやremote serverへ送ることはできない。

## Decision

`@loutrejs/cli`に`loutre devtools --entry <entry>`を追加し、CLI processがloopback interfaceでDevtools APIを公開する。

公式サイトの`/devtools/`はstaticなclient-side applicationとしてAPIへ接続する。Application DefinitionのloadとGraph projectionはローカルCLIだけが行い、公式サイトにはJSON serialize可能なGraph Snapshotだけを渡す。

```text
Local project
    │
    ▼
loutre devtools
    │  Application Modelをload / project
    │
    ├── GET  /api/graph
    ├── GET  /api/events
    └── POST /api/reload
             │
             ▼
Official website /devtools/
```

source変更はCLIが監視し、再buildしたSnapshotまたはerrorをServer-Sent Eventsで通知する。再buildに失敗した場合は直前の有効なSnapshotを保持し、UIがGraphを失わずにerrorを提示できるようにする。

Graph protocolには独立した`schemaVersion`を持たせる。npm package versionとprotocol互換性を同一視せず、公式サイトが未対応のshapeを曖昧に受理しないためである。

## Security boundary

APIは`127.0.0.1`だけにbindし、LANへ公開しない。

CORSは公式site originとローカルsite開発用originだけを既定で許可する。追加originはCLI optionによる明示指定を必要とする。Private Network Access preflightへも許可originの場合だけ応答する。

Web UIが接続できるURLも`localhost`、`127.0.0.1`、`::1`のHTTP originに限定する。入力されたremote endpointへ公式サイトからrequestを送る汎用clientにはしない。

CLIを起動すると対象Application Definitionは通常のGraph CLIと同様にローカルprocessで評価される。したがって、利用者が信頼していないprojectでこのcommandを実行しないことを利用条件とする。Graphへlive handler、factory、service instance、native resourceを含めない既存のGraph IR境界は変更しない。

## Website boundary

公式サイトは引き続き`output: "export"`でbuildし、server runtimeを追加しない。動的な状態を所有するのは利用者のローカルCLIであり、GitHub PagesはHTML、JavaScript、CSSだけを配信する。

Graph UIは公式サイトのReact componentおよびTailwind CSS themeとして実装する。ただしproduct siteのheaderとfooterを持つpage shellには含めず、viewport全体を占有する独立したapplication shellとして提供する。Graph canvas、interaction、MiniMapにはReact Flowを使い、階層layoutと直交edge routingにはELKを使う。Electron preload APIやNode.js APIへ依存させない。

## Alternatives

### 公式サイトへApplication Definitionをuploadする

採用しない。

Application Definitionは評価が必要なTypeScript codeであり、remote execution、dependency解決、secret混入、保存期間などの新しいsecurity boundaryが生じる。Graph projectionをローカルで完了すれば、その必要がない。

### Electron applicationを継続する

移行期間のfallbackとしては利用できるが、正本にはしない。

Web標準だけで成立するGraph UIにdesktop shellを必須とすると、公式サイトの既存資産を共有できず、配布と更新の責務も残る。

### WebSocketで更新を配信する

採用しない。

現在の更新はCLIからbrowserへの一方向通知であり、Server-Sent Eventsで十分である。手動再buildのrequestは通常のHTTP endpointとして分離できる。

## Consequences

- Devtools UIを公式サイトと同じdeployment、theme、component資産で更新できる。
- project codeやApplication Definitionをremote serverへ送らずに済む。
- CLIと公式サイトのprotocol compatibilityを`schemaVersion`で管理する必要がある。
- Browserのloopback access、CORS、Private Network Access policyに適合し続ける必要がある。
- Electron版固有のfile dialogやsource openerはWeb UIへそのまま移植できない。source locationは表示・copyを提供し、editor連携が必要になった時点でlocal APIのmutation権限を別途設計する。
