import {
  detectPresentationTerminal,
  renderLoutreBrand,
  renderStartupStatus,
  type StartupStatusInfo,
} from '@loutrejs/loutre/presentation'

const baseInfo: StartupStatusInfo = {
  application: 'api',
  version: '0.1.0',
  server: 'http://localhost:3000',
  runtime: 'Node.js 26.1.0',
  environment: 'development',
  startupDurationMs: 42,
}

describe('presentation', () => {
  it('TTYではLoutre wordmarkを生成する', () => {
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

  it('brandはnon-TTYではcompact outputを生成する', () => {
    expect(renderLoutreBrand({ isTTY: false, color: true })).toBe('Loutre')
  })

  it('brandはterminal幅がwordmarkより狭い場合にmascotへfallbackする', () => {
    expect(renderLoutreBrand({ isTTY: true, color: true, columns: 40 })).toBe(
      'ʕ•ᴥ•ʔ Loutre',
    )
  })

  it('listen成功後のstatusはmetadataとReadyを描画してbrandを含まない', () => {
    const status = renderStartupStatus(baseInfo, {
      isTTY: true,
      color: false,
      columns: 120,
    })

    expect(status).toContain('Application')
    expect(status).toContain('api')
    expect(status).toContain('Framework')
    expect(status).toContain('Loutre 0.1.0')
    expect(status).toContain('Listening on')
    expect(status).toContain('http://localhost:3000')
    expect(status).toContain('Runtime')
    expect(status).toContain('Node.js 26.1.0')
    expect(status).toContain('Environment')
    expect(status).toContain('development')
    expect(status).toContain('✓ Ready in 42 ms')
    expect(status).not.toContain('██╗')
    expect(status).not.toContain('ʕ•ᴥ•ʔ')
  })

  it('color無効時はrich statusにANSI sequenceを出さない', () => {
    const status = renderRich(baseInfo)
    expect(status).not.toContain('\u001B[')
  })

  it('color有効時はstatus metadataとReadyを着色する', () => {
    const status = renderRich(baseInfo, true)
    expect(status).toContain('\u001B[38;2;103;232;249mListening on')
    expect(status).toContain('\u001B[38;2;74;222;128m✓ Ready')
  })

  it('non-TTYではANSIなしのcompact statusを生成する', () => {
    expect(
      renderStartupStatus(baseInfo, {
        isTTY: false,
        color: true,
        columns: 120,
      }),
    ).toBe(
      [
        'Application: api',
        'Framework: Loutre 0.1.0',
        'Listening on http://localhost:3000',
        'Runtime: Node.js 26.1.0',
        'Environment: development',
        'Ready in 42 ms',
      ].join('\n'),
    )
  })

  it('version未指定でもstartup statusを生成できる', () => {
    const { version: _version, ...withoutVersion } = baseInfo
    const status = renderStartupStatus(withoutVersion, {
      isTTY: false,
      color: false,
    })

    expect(status).not.toContain('Framework:')
    expect(status).not.toContain('undefined')
  })

  it('terminal幅がrich status幅より狭い場合はcompact outputへfallbackする', () => {
    const status = renderStartupStatus(baseInfo, {
      isTTY: true,
      color: true,
      columns: 60,
    })

    expect(status).toContain('Application: api')
    expect(status).toContain('Listening on http://localhost:3000')
    expect(status).toContain('Ready in 42 ms')
    expect(status).not.toContain('\u001B[')
  })

  it('startup durationを入力値から丸めて描画する', () => {
    const status = renderRich({ ...baseInfo, startupDurationMs: 41.6 })
    expect(status).toContain('✓ Ready in 42 ms')
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

function renderRich(info: StartupStatusInfo, color = false): string {
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
