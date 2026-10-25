# ADR: Runtime Support Policy

- 状態: **ACCEPTED**
- 対象: Loutre v0.1
- Base: `develop`
- 日付: 2026-08-28 JST
- 更新: 2026-10-15 JST

v0.8.0からDenoのRuntime adapter、CLI host、initializer supportを終了する。

## 0. 結論

Loutreのruntime supportは、単一の「最新バージョン固定」ではなく、各runtime upstreamのrelease / support modelへ追従する。

runtime identityは実行環境の種類を表し、versionを含めない。

```text
node
bun
cloudflare-workers
aws-lambda
electron
```

> **Runtime identity identifies the runtime family, not a runtime release.**

versionはsupport policyとCI matrixが管理する。`node-26`、`bun-1.4-stable`、`electron-43`、`aws-lambda-nodejs24.x` のようなversion入りidentityは使用しない。

## 1. Current support snapshot

2026-08-28時点のbaselineに、2026-10-15のBun minimum更新を反映したsupport範囲は次の通り。

- Node.js: support中LTSは22 / 24、Primaryは24 LTS
- Bun: minimumは1.4.0、Primaryは現行stableの1.4
- Electron: upstreamでsupport中のstable majorすべてとして42 / 43 / 44、Primaryは44
- workerd: lockfile-pinned releaseを検証し、そのreleaseをPrimaryとする
- AWS Lambda: AWSがGA提供するNode.js managed runtimeとしてnodejs22.x / nodejs24.x、Primaryはnodejs24.x

具体的versionはsnapshotであり、永続的な設計値ではない。Source of Truthは以下の更新ルールとする。

## 2. Node.js

Node.js固有のminimum versionは独立した`@loutrejs/node`の`engines.node`で表現する。portableな`@loutrejs/loutre`にはNode.js engine constraintを設定しない。このpackage boundaryの理由は[package配布architecture](./loutre_package_distribution_architecture.md)を正本とする。

Node.jsはupstreamでsupport中のLTS majorをLoutreのsupport対象とする。

- minimum support: support中LTSの最古major
- development baseline: latest LTS
- CI: support中LTSすべて + Currentをforward compatibilityとして検証

2026-08-28時点では:

```text
minimum     Node 22
latest LTS  Node 24
Current     Node 26
```

Node上で実行される公開packageはminimumをsemver rangeとして宣言する。

```json
{
  "engines": {
    "node": ">=22"
  }
}
```

`24.x`のようにdevelopment baselineへpackage consumerを固定しない。

`@loutrejs/loutre`はNode専用packageではないためNode engineを宣言しない。`@loutrejs/node`およびNodeで実行するexampleはNode minimumを宣言する。`@loutrejs/cli`はNode.js / Bunの複数host runtimeで実行するため、Node.jsだけを要求する`engines.node`は宣言しない。

`.nvmrc`はminimumではなくdevelopment baselineを表し、latest LTSを使用する。

### 2.1 CLI host runtime

`@loutrejs/cli`のhost runtime supportはNode.js / Bunとする。各host runtimeのsupport versionは本ADRのNode.js / Bun policyへ追従する。

Source Location parser等のdeveloper tooling dependencyを理由にCLIのhost runtime baselineを個別に引き上げない。Source instrumentationのparser選定とportable runtime境界の詳細は[`loutre_source_location_instrumentation.md`](./loutre_source_location_instrumentation.md)を参照する。

CLI implementationは2 runtimeで共通して利用可能なWeb APIとNode.js compatibility APIのsubsetへ制限し、Node専用packageをruntime dependencyとして要求しない。Node runtimeのCapability検査に必要なmetadataはruntime-neutralな`@loutrejs/loutre/runtime`から取得する。

`bin/loutre.js`のshebangはnpm / npx ecosystemとの互換性のため`#!/usr/bin/env node`を維持する。これはCLI implementationのNode専用化を意味しない。Bunでnative実行する場合は`bunx --bun`または`bun run --bun`を使用する。

CIはCLIの`check` / `build` / `openapi`を各host runtime自身で実行し、Application runtime conformanceとは別にCLI host portabilityを検証する。

Bunのruntime conformanceと`create-loutre` native initializerは、それぞれのruntime自身でdependency installと必要なpackage buildを行い、Node.js setupやnpm commandへ依存しない。Node.js系、AWS Lambda、Electron、Cloudflare Workersのconformanceは各検証に必要なNode.js toolingを明示的にsetupする。

公開packageはNode.jsで`npm pack`したtarballをartifactとして固定し、repository sourceをcheckoutしないconsumer jobでNode.js / Bunからinstall・runtime import・CLI実行・`create-loutre`実行を検証する。

## 3. Bun

Bunのminimum supportは1.4.0とし、Primaryは現行stable releaseとする。以前の「current stable minorとprevious stable minorを対象にする」方針から変更し、Bun 1.3のsupportは終了する。

Bun 1.3ではserver側からWebSocketを閉じるとnative `stop()`が完了しないため、frameworkにタイマー・強制stop・event loop参照解除の回避処理が必要だった。Bun 1.4.0では同じ再現が正常に完了する。旧runtimeの既知不具合をframeworkで補うより、minimumを引き上げてnative lifecycleをそのまま扱うことを優先する。

CIはminimumの1.4.0と採用済みの現行stableを検証する。同じversionの場合は一度だけ検証し、新しいstableを採用したときにmatrixへ追加する。minimumの変更は本ADRとCI、generated projectのrequirementを同時に更新する。

```text
1.4.0 (minimum / Primary)
    ↓ 新しいstableの採用時
1.4.0 (minimum) + 新しいstable (Primary)
```

Bun向けgenerated projectは`engines.bun: >=1.4.0`を宣言する。portable packageにはruntimeを限定するengine constraintを追加せず、Bun AdapterとCLI / initializerの実行入口で1.4.0未満を拒否する。runtime identityはversionを含めず、常に`bun`とする。

## 4. Electron

Electronはupstreamがsupportしているstable majorをすべてsupportする。

2026-08-28時点では42 / 43 / 44をCIで検証する。

upstream EOLに到達したmajorはLoutreのsupport matrixからも外す。特定majorをruntime identityへ埋め込まない。

runtime identityは常に `electron` とする。

## 5. Cloudflare Workers / workerd

workerdは日付ベースのrelease cadenceを持つため、Loutre独自の長期minimum semverを定義しない。

CIではrepository lockfileが解決したworkerd releaseを再現可能な形で検証する。

Cloudflare Workersのbehavioral compatibility boundaryはworkerd package versionではなく`compatibility_date`を中心に扱う。

adapterが特定compatibility date以降のsemanticsを要求する場合、その条件はversion入りruntime identityではなく明示的なcompatibility metadataとして表現する。

Loutreのruntime identityはサービス名を表す `cloudflare-workers` とする。`workerd`はCloudflare Workersを支える実エンジン名として、package versionやconformance実行時にのみ使用する。

## 6. AWS Lambda

AWS Lambda adapterはAWSがGAとして提供しているNode.js managed runtimeをsupport対象とする。

preview runtimeはofficial support baselineへ含めない。

2026-08-28時点では:

```text
nodejs22.x
nodejs24.x
```

をCIで検証する。

AWS Lambda adapterのidentityはmanaged runtime versionではなくサービスfamilyを表すため、常に `aws-lambda` とする。

## 7. CI policy

CIはsupport policyを実際に検証する。

Bun minimum更新後のmatrix（他runtimeは既存のbaseline）:

```text
Node.js
├ 22.x
├ 24.x
└ 26.x (forward compatibility)

Bun
└ 1.4.0

Electron
├ 42.11.18
├ 43.8.3
└ 44.9.3

Cloudflare Workers
└ workerd package-lock.json pinned release

AWS Lambda
├ Node.js 22
└ Node.js 24
```

Node minimum API compatibilityはNode 22 runtime executionだけでなく、Node 22 type baselineでも検証する。repositoryのdevelopment型定義が新しくても、CIでNode 22の型定義へ一時的に差し替えてtypecheck / type tests / buildを実行する。

## 8. Runtime identity

Canonical identity:

```ts
nodeRuntime.runtime === 'node'
bunRuntime.runtime === 'bun'
cloudflareWorkersRuntime.runtime === 'cloudflare-workers'
awsLambdaRuntime.runtime === 'aws-lambda'
electronRuntime.runtime === 'electron'
```

identityへversionを含めない理由:

- support window更新でpublic identityを変更しない
- logging / capability reporting / toolingがversion lifecycleから独立する
- `node-22` / `node-24`のような同一runtime familyの分裂を防ぐ
- public adapter名とruntime identityの意味を揃える

実際のruntime versionがdiagnosticsで必要な場合は、identityとは別のruntime-specific version情報として取得する。

## 10. Update procedure

runtime lifecycle更新時は、原則として同一PRで以下を更新する。

1. upstream support statusを確認する
2. 本ADRのCurrent support snapshotを更新する
3. CI matrixを更新する
4. minimumが変わる場合は`engines`を更新する
5. minimum API type baselineを更新する
6. generated project / exampleのruntime requirementを更新する

support終了済みversionを惰性で残さず、まだsupport中のversionを理由なく切り捨てない。

## 11. Non-goals

以下は本policyの目的ではない。

- 過去の全runtime versionを永久supportすること
- runtimeごとに同一のLTS terminologyを強制すること
- runtime versionをApplication Graph identityにすること
- Current / preview releaseをstable supportと同一視すること

## 12. Freeze

> **Loutre follows each runtime's upstream lifecycle.**

> **Minimum support is a compatibility boundary; development baseline is not a consumer lock.**

> **Runtime identity is stable across runtime releases.**
