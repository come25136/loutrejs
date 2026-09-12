# @loutrejs/tasks

Loutre Application Graph KernelへTask invocationを接続する公式Extensionです。

単独で呼び出すTaskはModuleの`executions`へ登録し、Extension identityから合成される`application.tasks.run()`で実行します。TriggerやQueue Consumerが参照するTaskは参照closureから自動でApplication Modelへ含まれるため、Taskを重ねて`executions`へ書く必要はありません。各invocationはCoreのactive execution lifetimeへ参加します。Trigger engineは`application.tasks.start()` / `application.tasks.stop()`で制御します。

```ts
import { task } from '@loutrejs/tasks'

const cleanup = task<void, void>({
  name: 'cleanup',
  factory: () => async () => {
    // cleanup処理
  },
})
```
