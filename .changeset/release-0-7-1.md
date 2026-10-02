---
'@loutrejs/loutre': patch
'@loutrejs/node': patch
'@loutrejs/bullmq': patch
'@loutrejs/cli': patch
'create-loutre': patch
---

依存関係を更新し、Node.js / Bun / Deno / Electron / Cloudflare Workersを含むruntime・tooling matrixでの互換性を維持しました。Vitest 5への更新に合わせてE2E test suiteの逐次実行指定も新APIへ移行しています。

Dependabotの通常更新には7日間のcooldownを適用し、security updateは即時に取り込みつつCIのminimum dependency age制限をsecurity PRだけ解除する運用へ揃えました。
