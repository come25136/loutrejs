import {
  LOUTRE_VERSION,
  detectPresentationTerminal,
  renderLoutreBrand,
  renderStartupPrelude,
  renderStartupStatus,
  startStartupPresentation,
  type StartupPresentationInfo,
  type StartupStatusInfo,
} from '@loutrejs/loutre/presentation'

const startupInfo: StartupPresentationInfo = {
  version: '0.1.0',
}

const statusInfo: StartupStatusInfo = {
  server: 'http://localhost:3000',
  runtime: 'Node.js 26.1.0',
  environment: 'development',
  startupDurationMs: 42,
}

describe('presentation', () => {
  it('standalone brandはTTYでLoutre wordmarkを生成する', () => {
    const brand = renderLoutreBrand({
      isTTY: true,
      color: true,
      columns: 120,
    })

    expect(brand).toContain('██╗')
    expect(stripAnsi(brand)).toContain('ʕ•ᴥ•ʔ Loutre')
    expect(brand).toContain('\u001B[38;2;244;211;164m')
    expect(brand).toContain('\u001B[38;2;112;66;45m')
    expect(logoColorSequence(brand)).toEqual([
      '244;211;164',
      '224;179;119',
      '198;139;75',
      '167;105;58',
      '112;66;45',
      '198;139;75',
    ])
  })

  it('standalone brandはnon-TTYではcompact outputを生成する', () => {
    expect(renderLoutreBrand({ isTTY: false, color: true })).toBe('Loutre')
  })

  it('standalone brandはterminal幅がwordmarkより狭い場合にmascotへfallbackする', () => {
    expect(renderLoutreBrand({ isTTY: true, color: true, columns: 40 })).toBe(
      'ʕ•ᴥ•ʔ Loutre',
    )
  })

  it('listen前のpreludeはframeを開いてlogoとversion付きbrandだけを描画する', () => {
    const prelude = renderRichPrelude(startupInfo)

    expect(prelude).toContain('╭')
    expect(prelude).toContain('██╗')
    expect(prelude).toContain('ʕ•ᴥ•ʔ  Loutre 0.1.0')
    expect(prelude).not.toContain('Application')
    expect(prelude).not.toContain('Server')
    expect(prelude).not.toContain('Ready')
    expect(prelude).not.toContain('╰')
    expect(prelude).not.toContain('typed · modular · fast')
  })

  it('listen成功後のstatusはmetadataを描画してframeを閉じ、Readyをframe外へ出す', () => {
    const status = renderRichStatus(statusInfo)
    const lines = status.split('\n')
    const bottomBorder = lines.findIndex((line) => line.startsWith('╰'))
    const ready = lines.findIndex((line) => line.includes('✓ Ready in 42 ms'))

    expect(status).toContain('Server')
    expect(status).toContain('http://localhost:3000')
    expect(status).toContain('Runtime')
    expect(status).toContain('Node.js 26.1.0')
    expect(status).toContain('Environment')
    expect(status).toContain('development')
    expect(status).not.toContain('Application')
    expect(bottomBorder).toBeGreaterThanOrEqual(0)
    expect(ready).toBeGreaterThan(bottomBorder)
    expect(status).not.toContain('██╗')
    expect(status).not.toContain('ʕ•ᴥ•ʔ')
    expect(status).not.toContain('Framework')
    expect(status).not.toContain('Listening on')
  })

  it('preludeとstatusを順に出すと旧startup banner相当の単一frameになる', () => {
    const banner = `${renderRichPrelude(startupInfo)}\n${renderRichStatus(statusInfo)}`
    const frameLines = banner
      .split('\n')
      .map(stripAnsi)
      .filter((line) => /^[╭│╰]/u.test(line))
    const widths = new Set(frameLines.map((line) => [...line].length))

    expect(banner.match(/╭/gu)).toHaveLength(1)
    expect(banner.match(/╰/gu)).toHaveLength(1)
    expect(widths).toEqual(new Set([72]))
    expect(banner).not.toContain('typed · modular · fast')
  })

  it('color無効時はrich startup presentationにANSI sequenceを出さない', () => {
    const banner = `${renderRichPrelude(startupInfo)}\n${renderRichStatus(statusInfo)}`
    expect(banner).not.toContain('\u001B[')
  })

  it('color有効時はframe・metadata・Readyを着色する', () => {
    const prelude = renderRichPrelude(startupInfo, true)
    const status = renderRichStatus(statusInfo, true)

    expect(prelude).toContain('\u001B[38;2;71;85;105m╭')
    expect(status).toContain('\u001B[38;2;103;232;249mServer')
    expect(status).toContain('\u001B[38;2;74;222;128m✓ Ready')
  })

  it('non-TTYではpreludeとstatusをANSIなしのcompact outputへ分離する', () => {
    const options = { isTTY: false, color: true, columns: 120 } as const

    expect(renderStartupPrelude(startupInfo, options)).toBe('Loutre 0.1.0')
    expect(renderStartupStatus(statusInfo, options)).toBe(
      [
        'Server: http://localhost:3000',
        'Runtime: Node.js 26.1.0',
        'Environment: development',
        'Ready in 42 ms',
      ].join('\n'),
    )
  })

  it('terminal幅がrich frameより狭い場合はpreludeとstatusをcompact outputへfallbackする', () => {
    const options = { isTTY: true, color: true, columns: 60 } as const
    const prelude = renderStartupPrelude(startupInfo, options)
    const status = renderStartupStatus(statusInfo, options)

    expect(prelude).toBe('Loutre 0.1.0')
    expect(status).not.toContain('Application')
    expect(status).toContain('Server: http://localhost:3000')
    expect(status).toContain('Ready in 42 ms')
    expect(`${prelude}\n${status}`).not.toContain('██╗')
    expect(`${prelude}\n${status}`).not.toContain('\u001B[')
  })

  it('startup durationを入力値から丸めて描画する', () => {
    const status = renderRichStatus({ ...statusInfo, startupDurationMs: 41.6 })
    expect(status).toContain('✓ Ready in 42 ms')
  })

  it('startup sessionはpreludeを開始時、statusをready時だけ出力する', () => {
    const output: string[] = []
    const session = startStartupPresentation(
      { version: LOUTRE_VERSION },
      {
        terminal: { isTTY: false, color: false },
        write: (value) => output.push(value),
      },
    )

    expect(output).toEqual([`Loutre ${LOUTRE_VERSION}`])

    session.ready(statusInfo)

    expect(output).toHaveLength(2)
    expect(output[1]).toContain('Server: http://localhost:3000')
    expect(output[1]).toContain('Ready in 42 ms')
  })

  it('Node.jsのcolor depthと環境変数からterminal capabilityを判定する', () => {
    const output = {
      isTTY: true,
      columns: 120,
      getColorDepth: () => 24,
    }

    expect(detectPresentationTerminal(output, {})).toEqual({
      isTTY: true,
      color: true,
      columns: 120,
    })
    expect(detectPresentationTerminal(output, { NO_COLOR: '1' })).toEqual({
      isTTY: true,
      color: false,
      columns: 120,
    })
    expect(
      detectPresentationTerminal(output, { NODE_DISABLE_COLORS: '1' }),
    ).toEqual({
      isTTY: true,
      color: false,
      columns: 120,
    })
    expect(
      detectPresentationTerminal(
        {
          ...output,
          getColorDepth: (environment) =>
            environment?.FORCE_COLOR === '3' ? 24 : 1,
        },
        { FORCE_COLOR: '3' },
      ),
    ).toEqual({ isTTY: true, color: true, columns: 120 })
  })
})

function renderRichPrelude(
  info: StartupPresentationInfo,
  color = false,
): string {
  return renderStartupPrelude(info, { isTTY: true, color, columns: 160 })
}

function renderRichStatus(info: StartupStatusInfo, color = false): string {
  return renderStartupStatus(info, { isTTY: true, color, columns: 160 })
}

function stripAnsi(value: string): string {
  const escape = String.fromCodePoint(0x1b)
  return value.replace(new RegExp(`${escape}\\[[0-?]*[ -/]*[@-~]`, 'g'), '')
}

function logoColorSequence(brand: string): readonly string[] {
  const firstLogoLine = brand.split('\n').find((line) => line.includes('██╗'))
  if (!firstLogoLine) return []
  const escape = String.fromCodePoint(0x1b)
  return [
    ...firstLogoLine.matchAll(
      new RegExp(`${escape}\\[38;2;(\\d+;\\d+;\\d+)m`, 'g'),
    ),
  ].map((match) => match[1]!)
}
