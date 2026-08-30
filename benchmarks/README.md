# Loutre Benchmarks

Loutre の performance regression を同一条件で継続的に比較するための benchmark harness。

公開値を都合よく選ぶための script ではなく、同じ machine・同じ workload・同じ load generator で結果を再現できることを優先する。

## HTTP throughput

```sh
npm run benchmark:http
```

`benchmark:http` は先に repository 全体を build し、その artifact を使って次の server を順番に測定する。

- `loutre` — canonical HTTP CRUD integration を `@loutrejs/node` で serve
- `node` — 同じ JSON response を返す Node.js `node:http` baseline

既定条件:

- warmup: 3 秒
- measurement: 10 秒
- concurrency: 32
- HTTP keep-alive: 有効
- workload: `GET /users/benchmark`
- cold-start samples: 5 回

結果には requests/sec、latency p50 / p95 / p99、cold-start median を含める。

条件は environment variable で上書きできる。

```sh
BENCHMARK_WARMUP_MS=5000 \
BENCHMARK_DURATION_MS=30000 \
BENCHMARK_CONCURRENCY=64 \
BENCHMARK_COLD_START_SAMPLES=10 \
npm run benchmark:http
```

## 比較ルール

Framework 間比較を追加する場合も `benchmarks/scenarios.mjs` に server process を追加し、load generator は共通の `benchmarks/run.mjs` を使う。

比較時には少なくとも次を記録する。

- commit SHA
- Node.js version
- OS / architecture
- CPU model
- warmup / measurement duration
- concurrency
- dependency version

異なる machine で取得した requests/sec を横並びにしない。CI runner の値も regression 検知には使えるが、absolute performance の公開値には使わない。

## 今後の比較対象

Hono、Fastify、ZeltJS、NestJS などを追加するときは、それぞれに有利な独自 load generator を使わず、この harness の同一 workload へ adapter を追加する。

server startup、Application bootstrap、bundle size、memory など HTTP throughput 以外の benchmark は別 scenario として追加する。ひとつの数値へまとめない。
