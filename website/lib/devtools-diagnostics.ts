import type { GraphDiagnostic, GraphSnapshot } from './devtools'
import type { Locale } from './i18n'

export function diagnosticsByNodeId(
  snapshot: GraphSnapshot,
): ReadonlyMap<string, readonly GraphDiagnostic[]> {
  const nodeIds = new Set(snapshot.nodes.map((node) => node.id))
  const diagnostics = new Map<string, GraphDiagnostic[]>()
  for (const diagnostic of snapshot.diagnostics) {
    if (!nodeIds.has(diagnostic.path)) continue
    diagnostics.set(diagnostic.path, [
      ...(diagnostics.get(diagnostic.path) ?? []),
      diagnostic,
    ])
  }
  return diagnostics
}

export function diagnosticSource(
  snapshot: GraphSnapshot,
  diagnostic: GraphDiagnostic,
): string | undefined {
  const source = snapshot.nodes.find(
    (node) => node.id === diagnostic.path,
  )?.source
  if (!source) return undefined
  return [source.file, source.line, source.column]
    .filter((part) => part !== undefined)
    .join(':')
}

export function buildDiagnosticAgentPrompt(
  snapshot: GraphSnapshot,
  locale: Locale,
): string {
  const heading =
    locale === 'ja'
      ? [
          'LoutreアプリケーションのGraph診断を修正してください。',
          '診断ごとに原因を確認し、最小限の変更で解消してください。修正後は対象のチェックを実行し、変更点と検証結果を報告してください。',
        ].join('\n')
      : [
          'Fix the following Loutre application Graph diagnostics.',
          'Investigate each root cause, make the smallest appropriate change, then run the relevant checks and report the changes and verification results.',
        ].join('\n')
  const diagnostics = snapshot.diagnostics.map((diagnostic) => {
    const source = diagnosticSource(snapshot, diagnostic)
    return [
      `- [${(diagnostic.severity ?? 'error').toUpperCase()}] ${diagnostic.code}`,
      `  Path: ${diagnostic.path}`,
      ...(source ? [`  Source: ${source}`] : []),
      `  Message: ${diagnostic.message}`,
    ].join('\n')
  })

  return [
    heading,
    '',
    `Graph context: ${snapshot.nodes.length} nodes, ${snapshot.edges.length} edges.`,
    '',
    'Diagnostics:',
    ...diagnostics,
  ].join('\n')
}
