// package間でversion定数を共有するとbrowser bundleへruntime実装が混入するため、
// website/tests/devtools-client.test.tsで値のずれを検出する。
export const DEVTOOLS_PROTOCOL_VERSION = 1
