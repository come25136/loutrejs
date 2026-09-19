import { describe, expect, it } from 'vitest'
import type { GraphSnapshot } from '../lib/devtools.js'
import {
  buildDiagnosticAgentPrompt,
  diagnosticSource,
  diagnosticsByNodeId,
} from '../lib/devtools-diagnostics.js'

const snapshot: GraphSnapshot = {
  schemaVersion: 1,
  nodes: [
    { id: 'module:1', kind: 'module', label: 'AppModule' },
    {
      id: 'provider:2',
      kind: 'provider',
      label: 'BrokenService',
      source: {
        file: 'tests/fixtures/devtools-diagnostic-app.ts',
        line: 15,
        column: 1,
      },
    },
  ],
  edges: [{ from: 'module:1', to: 'provider:2', kind: 'owns' }],
  diagnostics: [
    {
      code: 'LUTRE_PROVIDER_DEPENDENCY_MISSING',
      message: 'BrokenService has an unresolved dependency.',
      path: 'provider:2',
      severity: 'error',
    },
    {
      code: 'LUTRE_MODULE_EXPORT_UNRESOLVED',
      message: 'An export is not declared by the Module.',
      path: 'module:missing.exports.token',
      severity: 'warning',
    },
  ],
}

describe('DevTools diagnostics', () => {
  it('グラフ上に存在する対象Nodeへ診断を関連付ける', () => {
    const diagnostics = diagnosticsByNodeId(snapshot)

    expect(diagnostics.get('provider:2')).toEqual([snapshot.diagnostics[0]])
    expect(diagnostics.has('module:missing.exports.token')).toBe(false)
  })

  it('診断対象Nodeのsource locationを表示用文字列へ変換する', () => {
    expect(diagnosticSource(snapshot, snapshot.diagnostics[0]!)).toBe(
      'tests/fixtures/devtools-diagnostic-app.ts:15:1',
    )
    expect(diagnosticSource(snapshot, snapshot.diagnostics[1]!)).toBeUndefined()
  })

  it('英語のエージェントプロンプトへGraph文脈と全診断を含める', () => {
    const prompt = buildDiagnosticAgentPrompt(snapshot, 'en')

    expect(prompt).toContain(
      'Fix the following Loutre application Graph diagnostics.',
    )
    expect(prompt).toContain('Graph context: 2 nodes, 1 edges.')
    expect(prompt).toContain('[ERROR] LUTRE_PROVIDER_DEPENDENCY_MISSING')
    expect(prompt).toContain(
      'Source: tests/fixtures/devtools-diagnostic-app.ts:15:1',
    )
    expect(prompt).toContain('[WARNING] LUTRE_MODULE_EXPORT_UNRESOLVED')
    expect(prompt).toContain('Path: module:missing.exports.token')
  })

  it('日本語のエージェントプロンプトも同じ診断情報を保持する', () => {
    const prompt = buildDiagnosticAgentPrompt(snapshot, 'ja')

    expect(prompt).toContain(
      'LoutreアプリケーションのGraph診断を修正してください。',
    )
    expect(prompt).toContain('LUTRE_PROVIDER_DEPENDENCY_MISSING')
    expect(prompt).toContain('BrokenService has an unresolved dependency.')
  })

  it('severityがない診断はerrorとしてプロンプトへ出力する', () => {
    const prompt = buildDiagnosticAgentPrompt(
      {
        ...snapshot,
        diagnostics: [{ ...snapshot.diagnostics[0]!, severity: undefined }],
      },
      'en',
    )

    expect(prompt).toContain('[ERROR] LUTRE_PROVIDER_DEPENDENCY_MISSING')
  })
})
