import { spawn, type ChildProcess } from 'node:child_process'

export interface DevApplicationExit {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
}

export interface StartDevApplicationSupervisorOptions {
  readonly command: readonly [string, ...string[]]
  readonly cwd: string
  readonly environment: Readonly<Record<string, string>>
  readonly startImmediately?: boolean
  readonly shutdownTimeoutMs?: number
  readonly onStopped?: (exit: DevApplicationExit) => void
}

export interface DevApplicationSupervisor {
  readonly result: Promise<number>
  restartIfStopped(): void
  close(signal?: NodeJS.Signals): Promise<void>
}

export function startDevApplicationSupervisor(
  options: StartDevApplicationSupervisorOptions,
): DevApplicationSupervisor {
  const [executable, ...args] = options.command
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 2_000
  if (!Number.isFinite(shutdownTimeoutMs) || shutdownTimeoutMs < 0) {
    throw new TypeError(
      'shutdownTimeoutMs must be a non-negative finite number.',
    )
  }
  const useProcessGroup = process.platform !== 'win32'
  let child: ChildProcess | undefined
  let closing = false
  let settled = false
  let resolveResult!: (code: number) => void
  let rejectResult!: (reason: unknown) => void

  const result = new Promise<number>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  const finish = (code: number) => {
    if (settled) return
    settled = true
    cleanupSignals()
    resolveResult(code)
  }

  const fail = (error: unknown) => {
    if (settled) return
    settled = true
    cleanupSignals()
    rejectResult(error)
  }

  const start = () => {
    if (closing || settled || child) return
    const next = spawn(executable, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.environment },
      stdio: 'inherit',
      ...(useProcessGroup ? { detached: true } : {}),
    })
    child = next

    next.once('error', (error) => {
      if (child === next) child = undefined
      fail(error)
    })
    next.once('exit', (code, signal) => {
      if (child !== next) return
      child = undefined
      if (closing) {
        finish(0)
        return
      }
      if (code === 0) {
        finish(0)
        return
      }
      options.onStopped?.({ code, signal })
    })
  }

  const waitForSettlement = (): Promise<void> =>
    result.then(
      () => undefined,
      () => undefined,
    )

  const signalChild = (running: ChildProcess, signal: NodeJS.Signals): void => {
    if (
      useProcessGroup &&
      running.pid !== undefined &&
      running.exitCode === null &&
      running.signalCode === null
    ) {
      try {
        process.kill(-running.pid, signal)
        return
      } catch {
        // Process groupが既に消えている場合も、直下のchildへsignalできる可能性は残す。
      }
    }
    try {
      running.kill(signal)
    } catch {
      // 状態確認直後にchildが終了しても、shutdown処理自体は失敗させない。
    }
  }

  const close = async (signal: NodeJS.Signals = 'SIGTERM'): Promise<void> => {
    if (settled) return waitForSettlement()
    if (closing) return waitForSettlement()
    closing = true
    cleanupSignals()
    const running = child
    if (!running) {
      finish(0)
      return
    }

    let forceKillTimer: ReturnType<typeof setTimeout> | undefined
    if (running.exitCode === null && running.signalCode === null) {
      signalChild(running, signal)
      forceKillTimer = setTimeout(() => {
        if (
          child === running &&
          running.exitCode === null &&
          running.signalCode === null
        ) {
          signalChild(running, 'SIGKILL')
        }
      }, shutdownTimeoutMs)
    }
    try {
      await waitForSettlement()
    } finally {
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer)
    }
  }

  const onSigint = () => {
    void close('SIGINT')
  }
  const onSigterm = () => {
    void close('SIGTERM')
  }
  const cleanupSignals = () => {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
  }

  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)
  if (options.startImmediately !== false) start()

  return {
    result,
    restartIfStopped() {
      start()
    },
    close,
  }
}
