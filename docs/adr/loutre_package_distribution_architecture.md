# Loutre package配布architecture

ステータス: Accepted

## Context

Execution Extensionをsource moduleとして分離することと、利用者が個別にinstallしてversion管理するnpm packageへ分けることは、異なる判断である。npm packageは公開後に安全に廃止・統合しにくく、package数の増加はdependency更新、release、互換性管理を利用者へ永続的に負担させる。

一方、Runtime Adapterや外部integrationにはpackage metadataまたは独立したdependency lifecycleが必要な場合がある。特にnpmの`engines`はsubpathごとに指定できない。

## Decision

公開packageは次の5つに限定する。

```text
@loutrejs/loutre
@loutrejs/node
@loutrejs/bullmq
@loutrejs/cli
create-loutre
```

Tasks、MessagePort、WebSocketは内部では独立したExecution Extensionとして実装するが、配布時は次の`@loutrejs/loutre` subpathとする。

```text
@loutrejs/loutre/tasks
@loutrejs/loutre/message-port
@loutrejs/loutre/websocket
```

これらの機能はportableなCoreと同じversion lifecycleで利用され、個別にinstallまたはversion固定する合理的な境界を持たない。source module boundaryを保ったままnpm distribution boundaryだけを統合する。

## Node adapter

`@loutrejs/node`は独立packageとして維持し、`engines.node`でNode.jsのminimum versionを宣言する。Node adapterをmain packageのsubpathへ移すと、portableな`@loutrejs/loutre`全体へNode.js制約を課すか、package metadataで制約を表せなくなる。

`@loutrejs/loutre`には`engines.node`を設定しない。Bun、Deno、Cloudflare Workersなどから利用できるportable packageであり続ける。Runtime versionのsupport範囲は[Runtime support policy](./loutre_runtime_support_policy.md)を正本とする。

## 維持する独立package

`@loutrejs/bullmq`は公開済みであり、optional peer dependencyである`bullmq`とのintegration lifecycleを持つため、今回は独立packageを維持する。ただし外部dependencyの存在だけを、将来のpackage分割理由にはしない。

`@loutrejs/cli`は`esbuild`などdeveloper tooling固有のdependencyを持つ。Runtime library利用者へtooling dependencyを強制しないため独立させる。

`create-loutre`はinitializer binaryとして独立したuser-facing lifecycleを持つため維持する。生成projectはExecution Extensionのsubpathを利用し、独立Extension packageを追加しない。

## Execution Extension identity

Execution Extensionのidentityはnpm distribution identityから独立させ、`loutre:http`、`loutre:tasks`、`loutre:message-port`、`loutre:websocket`のframework-owned nameを使う。

identity判定はname文字列だけに依存しない。`defineExecutionExtension()`がnameと`abiVersion`から生成するbundle-safeなsymbol identityを使用し、同名で互換性のないABIやidentity collisionはApplication Model compilerが拒否する。これによりpackage topologyを変更してもcanonical Application Model上のidentityは変化しない。

## 将来のpackage追加基準

新しいpublic packageは、増やさない判断より強い根拠がある場合だけ追加する。少なくとも次を個別に評価する。

- 利用者が機能を独立してinstallする必要があるか
- main packageと異なるversion lifecycleが必要か
- `engines`やpeer dependencyなどpackage metadataでしか表現できない境界があるか
- dependency重量またはtooling用途をmain package利用者から隔離する必要があるか
- 公開後の長期的な互換性とrelease負担を正当化できるか

Execution Extensionであること、source directoryを分けること、外部dependencyを使うことだけでは、public package追加の根拠にしない。

## Consequences

release、Changesets、tarball検証は5packageだけを対象とする。protocolごとのsource facadeと`package.json`のsubpath exportsを一致させ、public API boundaryを明示する。

旧配布名`@loutrejs/tasks`、`@loutrejs/message-port`、`@loutrejs/websocket`は公開対象にせず、新しいcompatibility wrapperも設けない。
