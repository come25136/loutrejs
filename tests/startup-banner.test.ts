import {
  detectStartupBannerTerminal,
  printStartupBanner,
  renderStartupBanner,
  type StartupBannerInfo,
} from '@loutrefw/cli'

const baseInfo: StartupBannerInfo = {
  application: 'api',
  version: '0.1.0',
  server: 'http://localhost:3000',
  runtime: 'Node.js 26.1.0',
  environment: 'development',
  startupDurationMs: 42,
}

describe('startup banner', () => {
  it('TTYではwordmarkとframework metadataを含むrich bannerを生成する', () => {
    const banner = renderStartupBanner(baseInfo, {
      isTTY: true,
      color: true,
      columns: 120,
    })

    expect(banner).toContain('██╗')
    expect(stripAnsi(banner)).toContain('ʕ•ᴥ•ʔ')
    expect(banner).toContain('typed · modular · fast')
    expect(banner).toContain('Application')
    expect(banner).toContain('Server')
    expect(banner).toContain('Runtime')
    expect(banner).toContain('Environment')
    expect(banner).toContain('\u001B[38;2;244;211;164m')
    expect(banner).toContain('\u001B[38;2;112;66;45m')
    expect(logoColorSequence(banner)).toEqual([
      '244;211;164',
      '224;179;119',
      '198;139;75',
      '167;105;58',
      '112;66;45',
      '198;139;75',
    ])
  })

  it('color無効時はrich layoutを維持してANSI sequenceを出さない', () => {
    const banner = renderStartupBanner(baseInfo, {
      isTTY: true,
      color: false,
      columns: 120,
    })

    expect(banner).toContain('███████╗')
    expect(banner).not.toContain('\u001B[')
  })

  it('non-TTYではANSIなしのcompact outputを生成する', () => {
    expect(
      renderStartupBanner(baseInfo, {
        isTTY: false,
        color: true,
        columns: 120,
      }),
    ).toBe(
      [
        'Loutre 0.1.0 (api)',
        'Server: http://localhost:3000',
        'Ready in 42 ms',
      ].join('\n'),
    )
  })

  it('terminal幅がrich banner幅より狭い場合はcompact outputへfallbackする', () => {
    const banner = renderStartupBanner(baseInfo, {
      isTTY: true,
      color: true,
      columns: 60,
    })

    expect(banner).toContain('Loutre 0.1.0 (api)')
    expect(banner).not.toContain('██╗')
    expect(banner).not.toContain('\u001B[')
  })

  it('versionを入力値から描画する', () => {
    const banner = renderRich({ ...baseInfo, version: '9.8.7' })
    expect(banner).toContain('Loutre 9.8.7')
  })

  it('Application名を入力値から描画する', () => {
    const banner = renderRich({ ...baseInfo, application: 'billing-api' })
    expect(banner).toContain('billing-api')
  })

  it('server URLを入力値から描画する', () => {
    const banner = renderRich({ ...baseInfo, server: 'https://api.example.test' })
    expect(banner).toContain('https://api.example.test')
  })

  it('environmentを入力値から描画する', () => {
    const banner = renderRich({ ...baseInfo, environment: 'staging' })
    expect(banner).toContain('staging')
  })

  it('Runtimeを入力値から描画する', () => {
    const banner = renderRich({ ...baseInfo, runtime: 'Node.js 99.2.1' })
    expect(banner).toContain('Node.js 99.2.1')
  })

  it('startup durationを入力値から丸めて描画する', () => {
    const banner = renderRich({ ...baseInfo, startupDurationMs: 41.6 })
    expect(banner).toContain('✓ Ready in 42 ms')
  })

  it('ANSIを除去した全frame行の表示幅が一致する', () => {
    const banner = renderRich(baseInfo, true)
    const frameLines = banner
      .split('\n')
      .map(stripAnsi)
      .filter((line) => /^[╭│╰]/u.test(line))
    const widths = new Set(frameLines.map((line) => [...line].length))

    expect(widths).toEqual(new Set([72]))
  })

  it('renderとwriteを分離して出力できる', () => {
    const output: string[] = []
    printStartupBanner(
      baseInfo,
      { isTTY: false, color: false },
      (value) => output.push(value),
    )

    expect(output).toHaveLength(1)
    expect(output[0]).toContain('Ready in 42 ms')
  })

  it('Node.jsのcolor depthと環境変数からterminal capabilityを判定する', () => {
    const output = {
      isTTY: true,
      columns: 120,
      getColorDepth: () => 24,
    }

    expect(detectStartupBannerTerminal(output, {})).toEqual({
      isTTY: true,
      color: true,
      columns: 120,
    })
    expect(detectStartupBannerTerminal(output, { NO_COLOR: '1' })).toEqual({
      isTTY: true,
      color: false,
      columns: 120,
    })
    expect(
      detectStartupBannerTerminal(output, { NODE_DISABLE_COLORS: '1' }),
    ).toEqual({
      isTTY: true,
      color: false,
      columns: 120,
    })
    expect(
      detectStartupBannerTerminal(
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

function renderRich(info: StartupBannerInfo, color = false): string {
  return renderStartupBanner(info, { isTTY: true, color, columns: 160 })
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
}

function logoColorSequence(banner: string): readonly string[] {
  const firstLogoLine = banner.split('\n').find((line) => line.includes('██╗'))
  if (!firstLogoLine) return []
  return [...firstLogoLine.matchAll(/\u001B\[38;2;(\d+;\d+;\d+)m/g)]
    .map((match) => match[1]!)
    .filter((color) => color !== '71;85;105')
}
