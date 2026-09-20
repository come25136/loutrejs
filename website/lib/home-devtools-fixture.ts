import type { GraphSnapshot } from './devtools'

export const homeGraphSnapshot = {
  schemaVersion: 1,
  nodes: [
    {
      id: 'module:1',
      kind: 'module',
      label: 'UsersModule',
      attributes: { description: 'HTTP CRUD integration' },
      source: {
        file: 'integrations/http-crud/src/index.ts',
        line: 71,
        column: 28,
      },
    },
    {
      id: 'provider:1',
      kind: 'provider',
      label: 'UsersService',
      module: 'module:1',
      attributes: { providerKind: 'class', scope: 'application' },
      source: {
        file: 'integrations/http-crud/src/index.ts',
        line: 48,
        column: 8,
      },
    },
    {
      id: 'UsersController',
      kind: 'execution',
      label: 'UsersController',
      module: 'module:1',
      executionKind: 'http.request',
      capabilities: ['http.server'],
      source: {
        file: 'integrations/http-crud/src/index.ts',
        line: 54,
        column: 32,
      },
    },
    {
      id: 'capability:http.server',
      kind: 'runtime-capability',
      label: 'http.server',
      attributes: { frameworkKind: 'runtime-capability' },
    },
    {
      id: 'entrypoint:http:UsersController:get',
      kind: 'entrypoint',
      entrypointKind: 'http-route',
      label: 'GET /users/{id}',
      module: 'module:1',
      source: {
        file: 'integrations/http-crud/src/index.ts',
        line: 18,
        column: 30,
      },
      attributes: { name: 'get', method: 'GET', path: '/users/{id}' },
    },
    {
      id: 'handler:http:UsersController:get',
      kind: 'handler',
      label: 'UsersController.get',
      module: 'module:1',
      source: {
        file: 'integrations/http-crud/src/index.ts',
        line: 54,
        column: 32,
      },
      attributes: { route: 'get' },
    },
    {
      id: 'entrypoint:http:UsersController:create',
      kind: 'entrypoint',
      entrypointKind: 'http-route',
      label: 'POST /users',
      module: 'module:1',
      source: {
        file: 'integrations/http-crud/src/index.ts',
        line: 18,
        column: 30,
      },
      attributes: { name: 'create', method: 'POST', path: '/users' },
    },
    {
      id: 'middleware:http:UsersController:create:0',
      kind: 'middleware',
      label: 'validate.body',
      module: 'module:1',
      attributes: { route: 'create', index: 0 },
    },
    {
      id: 'handler:http:UsersController:create',
      kind: 'handler',
      label: 'UsersController.create',
      module: 'module:1',
      source: {
        file: 'integrations/http-crud/src/index.ts',
        line: 54,
        column: 32,
      },
      attributes: { route: 'create' },
    },
  ],
  edges: [
    { from: 'module:1', to: 'provider:1', kind: 'owns' },
    { from: 'module:1', to: 'UsersController', kind: 'owns' },
    { from: 'UsersController', to: 'provider:1', kind: 'injects' },
    {
      from: 'UsersController',
      to: 'capability:http.server',
      kind: 'requires',
    },
    {
      from: 'UsersController',
      to: 'entrypoint:http:UsersController:get',
      kind: 'handles',
      label: 'get',
    },
    {
      from: 'entrypoint:http:UsersController:get',
      to: 'handler:http:UsersController:get',
      kind: 'flows-to',
    },
    {
      from: 'UsersController',
      to: 'entrypoint:http:UsersController:create',
      kind: 'handles',
      label: 'create',
    },
    {
      from: 'entrypoint:http:UsersController:create',
      to: 'middleware:http:UsersController:create:0',
      kind: 'flows-to',
    },
    {
      from: 'middleware:http:UsersController:create:0',
      to: 'handler:http:UsersController:create',
      kind: 'flows-to',
    },
  ],
  diagnostics: [],
} as const satisfies GraphSnapshot

export const homeDevtoolsFixture = {
  route: 'POST /users',
  sourceFile: 'integrations/http-crud/src/index.ts',
  sourceLines: [
    {
      number: 54,
      text: 'export const UsersController = http.implementation({',
    },
    { number: 55, text: "  name: 'UsersController'," },
    { number: 56, text: '  contract: UsersContract,' },
    { number: 57, text: '  factory: (users = inject(UsersService)) => ({' },
    { number: 58, text: '    async get(ctx) {' },
    { number: 59, text: '      return ctx.response.found({' },
    {
      number: 60,
      text: "        body: { id: ctx.input.params.id, name: 'test' },",
    },
    { number: 61, text: '      })' },
    { number: 62, text: '    },' },
    { number: 63, text: '    async create(ctx) {' },
    { number: 64, text: '      return ctx.response.created({' },
    { number: 65, text: '        body: users.create(ctx.input.body.name),' },
  ],
  graphNodes: [
    { id: 'UsersController', label: 'UsersController', kind: 'execution' },
    {
      id: 'entrypoint:http:UsersController:create',
      label: 'POST /users',
      kind: 'entrypoint',
    },
    {
      id: 'middleware:http:UsersController:create:0',
      label: 'validate.body',
      kind: 'middleware',
    },
    {
      id: 'handler:http:UsersController:create',
      label: 'UsersController.create',
      kind: 'handler',
    },
    { id: 'provider:1', label: 'UsersService', kind: 'provider' },
    {
      id: 'capability:http.server',
      label: 'http.server',
      kind: 'runtime-capability',
    },
  ],
  trace: [
    { name: 'POST /users', duration: '32ms', depth: 0 },
    { name: 'UsersController.create', duration: '5ms', depth: 1 },
    { name: 'UsersService.create', duration: '18ms', depth: 2 },
  ],
} as const

export const homeDiagnosticFixture = {
  graphContext: '3 nodes, 2 edges',
  severity: 'ERROR',
  code: 'LUTRE_PROVIDER_DEPENDENCY_MISSING',
  path: 'provider:2',
  source: 'integrations/graph-probe/src/app.ts:31:5',
  message:
    'Provider graph-probe.storage requires graph-probe.missing, but no provider is declared.',
} as const
