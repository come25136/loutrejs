---
'@loutrejs/loutre': minor
'@loutrejs/http': minor
'@loutrejs/websocket': minor
'@loutrejs/tasks': minor
'@loutrejs/message-port': minor
---

Application Modelを正本とするExecution Extension architectureを導入します。HTTP、WebSocket、Task、MessagePortをCoreの公開rootだけに依存する独立Extensionとして分離し、型付きRuntime capability、active execution lifecycle、Host API合成、Graph projectionを提供します。
