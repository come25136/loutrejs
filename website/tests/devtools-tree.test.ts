import { describe, expect, it } from 'vitest'
import type { GraphSnapshot } from '../lib/devtools.js'
import { buildDevtoolsNodeTree } from '../lib/devtools-tree.js'

function flatten(
  items: ReturnType<typeof buildDevtoolsNodeTree>,
): readonly { id: string; depth: number }[] {
  const result: { id: string; depth: number }[] = []
  const visit = (
    children: ReturnType<typeof buildDevtoolsNodeTree>,
    depth: number,
  ) => {
    for (const item of children) {
      result.push({ id: item.node.id, depth })
      visit(item.children, depth + 1)
    }
  }
  visit(items, 0)
  return result
}

describe('Devtools node tree', () => {
  it('semantic containmentをModuleからRoute/Handlerまでtree化する', () => {
    const snapshot: GraphSnapshot = {
      schemaVersion: 1,
      diagnostics: [],
      nodes: [
        { id: 'app', kind: 'module', label: 'AppModule' },
        { id: 'shared', kind: 'module', label: 'SharedModule' },
        { id: 'repo', kind: 'provider', label: 'Repo', module: 'app' },
        {
          id: 'controller',
          kind: 'execution',
          label: 'Controller',
          module: 'app',
        },
        { id: 'route', kind: 'entrypoint', label: 'GET /users', module: 'app' },
        { id: 'middleware', kind: 'middleware', label: 'auth', module: 'app' },
        {
          id: 'handler',
          kind: 'handler',
          label: 'Controller.users',
          module: 'app',
        },
        { id: 'http', kind: 'runtime-capability', label: 'http.server' },
      ],
      edges: [
        { from: 'app', to: 'shared', kind: 'imports' },
        { from: 'app', to: 'repo', kind: 'owns' },
        { from: 'app', to: 'controller', kind: 'owns' },
        { from: 'controller', to: 'repo', kind: 'injects' },
        { from: 'controller', to: 'route', kind: 'handles' },
        { from: 'route', to: 'middleware', kind: 'flows-to' },
        { from: 'middleware', to: 'handler', kind: 'flows-to' },
        { from: 'controller', to: 'http', kind: 'requires' },
      ],
    }

    expect(flatten(buildDevtoolsNodeTree(snapshot))).toEqual([
      { id: 'app', depth: 0 },
      { id: 'shared', depth: 1 },
      { id: 'repo', depth: 1 },
      { id: 'controller', depth: 1 },
      { id: 'route', depth: 2 },
      { id: 'middleware', depth: 3 },
      { id: 'handler', depth: 4 },
      { id: 'http', depth: 2 },
    ])
  })

  it('cyclic module importsでもtreeを循環させない', () => {
    const snapshot: GraphSnapshot = {
      schemaVersion: 1,
      diagnostics: [],
      nodes: [
        { id: 'a', kind: 'module', label: 'A' },
        { id: 'b', kind: 'module', label: 'B' },
      ],
      edges: [
        { from: 'a', to: 'b', kind: 'imports' },
        { from: 'b', to: 'a', kind: 'imports' },
      ],
    }

    expect(flatten(buildDevtoolsNodeTree(snapshot))).toEqual([
      { id: 'a', depth: 0 },
      { id: 'b', depth: 1 },
    ])
  })
})
