import { LOUTRE_VERSION } from './generated/version.js'

export interface StartupPresentationInfo {
  readonly version: string
}

export interface StartupStatusInfo {
  readonly server: string
  readonly runtime: string
  readonly environment: string
  readonly startupDurationMs: number
}

export interface StartupPresentationSession {
  ready(info: StartupStatusInfo): void
}

export interface StartupPresentationStartOptions {
  readonly terminal: PresentationRenderOptions
  readonly write: (value: string) => void
}

export { LOUTRE_VERSION }

export interface PresentationRenderOptions {
  readonly isTTY: boolean
  readonly color: boolean
  readonly columns?: number
}

export interface PresentationTerminalOutput {
  readonly isTTY?: boolean
  readonly columns?: number
  readonly getColorDepth: (
    environment?: Readonly<Record<string, string | undefined>>,
  ) => number
}

export function detectPresentationTerminal(
  output: PresentationTerminalOutput,
  environment: Readonly<Record<string, string | undefined>>,
): PresentationRenderOptions {
  const isTTY = output.isTTY === true
  const colorDisabled =
    environment.NO_COLOR !== undefined ||
    environment.NODE_DISABLE_COLORS !== undefined
  const columns = output.columns
  return {
    isTTY,
    color: isTTY && !colorDisabled && output.getColorDepth(environment) >= 24,
    ...(columns !== undefined && columns > 0 ? { columns } : {}),
  }
}

export function startStartupPresentation(
  info: StartupPresentationInfo,
  options: StartupPresentationStartOptions,
): StartupPresentationSession {
  options.write(renderStartupPrelude(info, options.terminal))
  return {
    ready(status) {
      options.write(renderStartupStatus(status, options.terminal))
    },
  }
}

type RGB = readonly [red: number, green: number, blue: number]

const colors = {
  otterLight: [244, 211, 164],
  otterSand: [224, 179, 119],
  otterCaramel: [198, 139, 75],
  otterBrown: [167, 105, 58],
  otterDeep: [112, 66, 45],
  lavender: [192, 132, 252],
  lavenderSoft: [196, 181, 253],
  label: [103, 232, 249],
  value: [74, 222, 128],
  text: [148, 163, 184],
  frame: [71, 85, 105],
} as const satisfies Record<string, RGB>

const logoGlyphs = [
  ['██╗     ', '██║     ', '██║     ', '██║     ', '███████╗', '╚══════╝'],
  [
    ' ██████╗ ',
    '██╔═══██╗',
    '██║   ██║',
    '██║   ██║',
    '╚██████╔╝',
    ' ╚═════╝ ',
  ],
  [
    '██╗   ██╗',
    '██║   ██║',
    '██║   ██║',
    '██║   ██║',
    '╚██████╔╝',
    ' ╚═════╝ ',
  ],
  [
    '████████╗',
    '╚══██╔══╝',
    '   ██║   ',
    '   ██║   ',
    '   ██║   ',
    '   ╚═╝   ',
  ],
  ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
  ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
] as const

const logoColors = [
  colors.otterLight,
  colors.otterSand,
  colors.otterCaramel,
  colors.otterBrown,
  colors.otterDeep,
  colors.otterCaramel,
] as const

const minimumContentWidth = 68
const metadataIndent = '        '
const mascot = 'ʕ•ᴥ•ʔ'

export function renderLoutreBrand(options: PresentationRenderOptions): string {
  if (!options.isTTY) return 'Loutre'
  if (options.columns !== undefined && options.columns < logoWidth()) {
    return `${mascot} Loutre`
  }

  const logo = renderLogo(options.color)
  const brand = options.color
    ? `${paint(colors.lavender, mascot)} ${paint(colors.lavenderSoft, 'Loutre')}`
    : `${mascot} Loutre`
  return [...logo.styled, '', brand].join('\n')
}

export function renderStartupPrelude(
  info: StartupPresentationInfo,
  options: PresentationRenderOptions,
): string {
  if (!options.isTTY) return renderCompactPrelude(info)

  const layout = createStartupLayout(info)
  if (options.columns !== undefined && options.columns < layout.frameWidth) {
    return renderCompactPrelude(info)
  }
  return renderRichPrelude(info, layout.contentWidth, options.color)
}

export function renderStartupStatus(
  info: StartupStatusInfo,
  options: PresentationRenderOptions,
): string {
  if (!options.isTTY) return renderCompactStatus(info)

  const layout = createStartupLayout(info)
  if (options.columns !== undefined && options.columns < layout.frameWidth) {
    return renderCompactStatus(info)
  }
  return renderRichStatus(info, layout.contentWidth, options.color)
}

function renderCompactPrelude(info: StartupPresentationInfo): string {
  return `Loutre ${info.version}`
}

function renderCompactStatus(info: StartupStatusInfo): string {
  return [
    `Server: ${info.server}`,
    `Runtime: ${info.runtime}`,
    `Environment: ${info.environment}`,
    `Ready in ${formatDuration(info.startupDurationMs)}`,
  ].join('\n')
}

function renderRichPrelude(
  info: StartupPresentationInfo,
  contentWidth: number,
  color: boolean,
): string {
  const layout = createFrameLayout(contentWidth, color)
  const logo = renderLogo(color)
  const brand = `${mascot}  version ${info.version}`
  const styledBrand = `${paintWhen(color, colors.lavender, mascot)}  ${paintWhen(color, colors.lavenderSoft, `version ${info.version}`)}`

  return [
    layout.topBorder,
    layout.row(''),
    ...logo.plain.map((line, index) =>
      layout.centered(line, logo.styled[index]),
    ),
    layout.row(''),
    layout.centered(brand, styledBrand),
    layout.row(''),
  ].join('\n')
}

function renderRichStatus(
  info: StartupStatusInfo,
  contentWidth: number,
  color: boolean,
): string {
  const layout = createFrameLayout(contentWidth, color)
  const labels = ['Server', 'Runtime', 'Environment'] as const
  const labelWidth = Math.max(...labels.map(displayWidth))
  const metadata = [
    ['Server', info.server],
    ['Runtime', info.runtime],
    ['Environment', info.environment],
  ] as const

  return [
    ...metadata.map(([label, value]) => {
      const gap = ' '.repeat(labelWidth - displayWidth(label) + 3)
      const plain = `${metadataIndent}${label}${gap}${value}`
      const styled = `${metadataIndent}${paintWhen(color, colors.label, label)}${gap}${paintWhen(color, colors.value, value)}`
      return layout.row(plain, styled)
    }),
    layout.row(''),
    layout.bottomBorder,
    '',
    `  ${paintWhen(color, colors.value, '✓ Ready')} ${paintWhen(color, colors.text, `in ${formatDuration(info.startupDurationMs)}`)}`,
  ].join('\n')
}

function createStartupLayout(
  info: StartupPresentationInfo | StartupStatusInfo,
): {
  readonly contentWidth: number
  readonly frameWidth: number
} {
  const labelWidth = displayWidth('Environment')
  const metadata = (
    'server' in info ? [info.server, info.runtime, info.environment] : []
  ).map(
    (value) =>
      displayWidth(metadataIndent) + labelWidth + 3 + displayWidth(value),
  )
  const contentWidth = Math.max(
    minimumContentWidth,
    logoWidth(),
    'version' in info
      ? displayWidth(`${mascot}  version ${info.version}`)
      : minimumContentWidth,
    ...metadata,
  )
  return { contentWidth, frameWidth: contentWidth + 4 }
}

function createFrameLayout(
  contentWidth: number,
  color: boolean,
): {
  readonly topBorder: string
  readonly bottomBorder: string
  readonly row: (plain: string, styled?: string) => string
  readonly centered: (plain: string, styled?: string) => string
} {
  const frame = (value: string) => paintWhen(color, colors.frame, value)
  const row = (plain: string, styled = plain) =>
    `${frame('│')} ${styled}${' '.repeat(contentWidth - displayWidth(plain))} ${frame('│')}`
  const centered = (plain: string, styled = plain) => {
    const remaining = contentWidth - displayWidth(plain)
    const left = Math.floor(remaining / 2)
    return row(`${' '.repeat(left)}${plain}`, `${' '.repeat(left)}${styled}`)
  }
  const border = frame('─'.repeat(contentWidth + 2))
  return {
    topBorder: `${frame('╭')}${border}${frame('╮')}`,
    bottomBorder: `${frame('╰')}${border}${frame('╯')}`,
    row,
    centered,
  }
}

function renderLogo(color: boolean): {
  readonly plain: readonly string[]
  readonly styled: readonly string[]
} {
  const widths = logoGlyphs.map((glyph) => Math.max(...glyph.map(displayWidth)))
  const plain: string[] = []
  const styled: string[] = []
  for (let row = 0; row < logoGlyphs[0].length; row += 1) {
    const plainParts: string[] = []
    const styledParts: string[] = []
    for (let letter = 0; letter < logoGlyphs.length; letter += 1) {
      const value = logoGlyphs[letter]![row]!
      const padded = `${value}${' '.repeat(widths[letter]! - displayWidth(value))}`
      const rgb = logoColors[letter]!
      plainParts.push(padded)
      styledParts.push(paintWhen(color, rgb, padded))
    }
    plain.push(plainParts.join(' '))
    styled.push(styledParts.join(' '))
  }
  return { plain, styled }
}

function logoWidth(): number {
  const widths = logoGlyphs.map((glyph) => Math.max(...glyph.map(displayWidth)))
  return widths.reduce((sum, width) => sum + width, logoGlyphs.length - 1)
}

function paintWhen(color: boolean, rgb: RGB, value: string): string {
  return color ? paint(rgb, value) : value
}

function paint(rgb: RGB, value: string): string {
  return `\u001B[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${value}\u001B[0m`
}

function formatDuration(durationMs: number): string {
  return `${Math.max(0, Math.round(durationMs))} ms`
}

function displayWidth(value: string): number {
  let width = 0
  const ansiControlSequence = new RegExp(
    `${String.fromCodePoint(0x1b)}\\[[0-?]*[ -/]*[@-~]`,
    'g',
  )
  for (const character of value.replace(ansiControlSequence, '')) {
    const codePoint = character.codePointAt(0)!
    if (/\p{Mark}/u.test(character)) continue
    width += isFullWidth(codePoint) ? 2 : 1
  }
  return width
}

function isFullWidth(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1b000 && codePoint <= 0x1ffff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  )
}
