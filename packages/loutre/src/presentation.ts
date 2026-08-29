export interface StartupStatusInfo {
  readonly application: string
  readonly version?: string
  readonly server: string
  readonly runtime: string
  readonly environment: string
  readonly startupDurationMs: number
}

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
const metadataIndent = '  '
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

export function renderStartupStatus(
  info: StartupStatusInfo,
  options: PresentationRenderOptions,
): string {
  if (!options.isTTY) return renderCompactStatus(info)

  const contentWidth = startupStatusWidth(info)
  if (options.columns !== undefined && options.columns < contentWidth) {
    return renderCompactStatus(info)
  }
  return renderRichStatus(info, options.color)
}

function renderCompactStatus(info: StartupStatusInfo): string {
  return [
    `Application: ${info.application}`,
    ...(info.version === undefined
      ? []
      : [`Framework: ${loutreName(info.version)}`]),
    `Listening on ${info.server}`,
    `Runtime: ${info.runtime}`,
    `Environment: ${info.environment}`,
    `Ready in ${formatDuration(info.startupDurationMs)}`,
  ].join('\n')
}

function renderRichStatus(info: StartupStatusInfo, color: boolean): string {
  const style = (rgb: RGB, value: string) => (color ? paint(rgb, value) : value)
  const metadata = statusMetadata(info)
  const labelWidth = Math.max(...metadata.map(([label]) => displayWidth(label)))

  return [
    ...metadata.map(([label, value]) => {
      const gap = ' '.repeat(labelWidth - displayWidth(label) + 3)
      return `${metadataIndent}${style(colors.label, label)}${gap}${style(colors.value, value)}`
    }),
    '',
    `${metadataIndent}${style(colors.value, '✓ Ready')} ${style(colors.text, `in ${formatDuration(info.startupDurationMs)}`)}`,
  ].join('\n')
}

function statusMetadata(
  info: StartupStatusInfo,
): readonly (readonly [label: string, value: string])[] {
  return [
    ['Application', info.application],
    ...(info.version === undefined
      ? []
      : ([['Framework', loutreName(info.version)]] as const)),
    ['Listening on', info.server],
    ['Runtime', info.runtime],
    ['Environment', info.environment],
  ]
}

function startupStatusWidth(info: StartupStatusInfo): number {
  const metadata = statusMetadata(info)
  const labelWidth = Math.max(...metadata.map(([label]) => displayWidth(label)))
  const metadataWidth = Math.max(
    ...metadata.map(
      ([, value]) =>
        displayWidth(metadataIndent) + labelWidth + 3 + displayWidth(value),
    ),
  )
  return Math.max(minimumContentWidth, metadataWidth)
}

function renderLogo(color: boolean): { readonly styled: readonly string[] } {
  const widths = logoGlyphs.map((glyph) => Math.max(...glyph.map(displayWidth)))
  const styled: string[] = []
  for (let row = 0; row < logoGlyphs[0].length; row += 1) {
    const styledParts: string[] = []
    for (let letter = 0; letter < logoGlyphs.length; letter += 1) {
      const value = logoGlyphs[letter]![row]!
      const padded = `${value}${' '.repeat(widths[letter]! - displayWidth(value))}`
      const rgb = logoColors[letter]!
      styledParts.push(color ? paint(rgb, padded) : padded)
    }
    styled.push(styledParts.join(' '))
  }
  return { styled }
}

function logoWidth(): number {
  const widths = logoGlyphs.map((glyph) => Math.max(...glyph.map(displayWidth)))
  return widths.reduce((sum, width) => sum + width, logoGlyphs.length - 1)
}

function loutreName(version: string): string {
  return `Loutre ${version}`
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
