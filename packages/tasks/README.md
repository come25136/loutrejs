# @loutrejs/tasks

Loutre Application Graph KernelへTask invocationを接続する公式Extensionです。

TaskはModuleの`executions`へ登録し、Extension identityから合成される`application.tasks.run()`で実行します。各invocationはCoreのactive execution lifetimeへ参加します。

```ts
import { task } from '@loutrejs/tasks'

const cleanup = task<void, void>({
  name: 'cleanup',
  factory: () => async () => {
    // cleanup処理
  },
})
```
