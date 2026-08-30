import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { Agent, request as httpRequest } from 'node:http'
import { arch, cpus, platform, release } from 'node:os'
import { scenarios } from './scenarios.mjs'

const root = new URL('../', import.meta.url)
const config = {
  warmupMs: readPositiveInteger('BENCHMARK_WARMUP_MS', 3_000),
  durationMs: readPositiveInteger('BENCHMARK_DURATION_MS', 10_000),
  concurrency: readPositiveInteger('BENCHMARK_CONCURRENCY', 32),
  coldStartSamples: readPositiveInteger('BENCHMARK_COLD_START_SAMPLES', 5),
}
const selectedNames = new Set(
  (
    process.env.BENCHMARK_SCENARIOS ??
    scenarios.map(({ name }) => name).join(',')
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)
const selectedScenarios = scenarios.filter(({ name }) =>
  selectedNames.has(name),
)
if (selectedScenarios.length === 0) {
  throw new Error('BENCHMARK_SCENARIOS did not select any known scenario')
}

const results = []
for (const scenario of selectedScenarios) {
  const coldStarts = []
  for (let index = 0; index < config.coldStartSamples; index += 1) {
    const started = performance.now()
    const server = await startServer(scenario)
    coldStarts.push(performance.now() - started)
    await stopServer(server)
  }

  const server = await startServer(scenario)
  try {
    await runLoad(scenario, config.warmupMs, config.concurrency, false)
    const measurement = await runLoad(
      scenario,
      config.durationMs,
      config.concurrency,
      true,
    )
    results.push({
      scenario: scenario.name,
      requests: measurement.requests,
      requestsPerSecond: round(measurement.requestsPerSecond),
      latencyMs: {
        p50: round(percentile(measurement.latencies, 0.5)),
        p95: round(percentile(measurement.latencies, 0.95)),
        p99: round(percentile(measurement.latencies, 0.99)),
      },
      coldStartMs: {
        samples: coldStarts.map(round),
        median: round(percentile(coldStarts, 0.5)),
      },
    })
  } finally {
    await stopServer(server)
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      metadata: {
        commit: readCommit(),
        node: process.version,
        platform: `${platform()} ${release()}`,
        architecture: arch(),
        cpu: cpus()[0]?.model ?? 'unknown',
        config,
      },
      results,
    },
    null,
    2,
  )}\n`,
)

async function startServer(scenario) {
  const child = spawn(scenario.command, scenario.args, {
    cwd: root,
    env: {
      ...process.env,
      BENCHMARK_PORT: String(scenario.port),
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stderr = []
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => stderr.push(chunk))

  const ready = new Promise((resolvePromise, reject) => {
    let buffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('BENCHMARK_READY ')) {
          resolvePromise(line.slice('BENCHMARK_READY '.length))
          return
        }
      }
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      reject(
        new Error(
          `${scenario.name} exited before ready (${code ?? signal ?? 'unknown'}): ${stderr.join('')}`,
        ),
      )
    })
  })

  const timeout = AbortSignal.timeout(15_000)
  await Promise.race([
    ready,
    new Promise((_, reject) => {
      timeout.addEventListener(
        'abort',
        () => reject(new Error(`${scenario.name} did not become ready`)),
        { once: true },
      )
    }),
  ])
  return child
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5_000)
  try {
    await once(child, 'exit')
  } finally {
    clearTimeout(timeout)
  }
}

async function runLoad(scenario, durationMs, concurrency, recordLatencies) {
  const agent = new Agent({ keepAlive: true, maxSockets: concurrency })
  const deadline = performance.now() + durationMs
  const latencies = []
  let requests = 0
  const started = performance.now()

  try {
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (performance.now() < deadline) {
          const requestStarted = performance.now()
          await requestOnce(scenario, agent)
          requests += 1
          if (recordLatencies)
            latencies.push(performance.now() - requestStarted)
        }
      }),
    )
  } finally {
    agent.destroy()
  }

  const elapsedSeconds = (performance.now() - started) / 1_000
  return {
    requests,
    requestsPerSecond: requests / elapsedSeconds,
    latencies,
  }
}

function requestOnce(scenario, agent) {
  return new Promise((resolvePromise, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port: scenario.port,
        path: scenario.path,
        method: 'GET',
        agent,
      },
      (response) => {
        response.resume()
        response.once('end', () => {
          if (response.statusCode !== 200) {
            reject(
              new Error(
                `${scenario.name} returned HTTP ${response.statusCode ?? 'unknown'}`,
              ),
            )
            return
          }
          resolvePromise()
        })
      },
    )
    request.once('error', reject)
    request.end()
  })
}

function percentile(values, ratio) {
  if (values.length === 0) return 0
  const sorted = values.toSorted((left, right) => left - right)
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * ratio) - 1,
  )
  return sorted[index] ?? 0
}

function round(value) {
  return Number(value.toFixed(3))
}

function readPositiveInteger(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

function readCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return process.env.GITHUB_SHA ?? 'unknown'
  }
}
