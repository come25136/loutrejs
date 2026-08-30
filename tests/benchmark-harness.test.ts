import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

describe('Benchmark harness', () => {
  it('同一条件の計測結果を再現情報付きJSONとして取得できる', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['benchmarks/run.mjs'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          BENCHMARK_SCENARIOS: 'node',
          BENCHMARK_WARMUP_MS: '20',
          BENCHMARK_DURATION_MS: '50',
          BENCHMARK_CONCURRENCY: '1',
          BENCHMARK_COLD_START_SAMPLES: '1',
        },
        timeout: 10_000,
      },
    )
    const result = JSON.parse(stdout) as {
      readonly metadata: {
        readonly node: string
        readonly config: { readonly concurrency: number }
      }
      readonly results: readonly {
        readonly scenario: string
        readonly requests: number
        readonly requestsPerSecond: number
        readonly latencyMs: { readonly p99: number }
        readonly coldStartMs: { readonly samples: readonly number[] }
      }[]
    }

    expect(result.metadata.node).toBe(process.version)
    expect(result.metadata.config.concurrency).toBe(1)
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        scenario: 'node',
        requests: expect.any(Number),
        requestsPerSecond: expect.any(Number),
        latencyMs: expect.objectContaining({ p99: expect.any(Number) }),
        coldStartMs: expect.objectContaining({ samples: [expect.any(Number)] }),
      }),
    )
    expect(result.results[0]?.requests).toBeGreaterThan(0)
  })
})
