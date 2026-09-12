---
'@loutrejs/node': patch
'@loutrejs/bullmq': patch
'create-loutre': minor
---

Application Model / Execution Extensionの新しいpackage boundaryへ追従します。Node adapterはCoreのextension requirementとserver port helperを共有し、BullMQ integrationとinitializerはTasksを`@loutrejs/loutre/tasks`から利用します。initializerは0.6系のpackage topologyへ移行するためminor releaseとして扱います。
