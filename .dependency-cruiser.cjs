/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'loutre-core-must-not-depend-on-http',
      severity: 'error',
      comment:
        'HTTP is an Execution Extension subpath. Core/application/runtime code must not depend on HTTP semantics.',
      from: {
        path: '^packages/loutre/src/(?!http(?:/|$))',
      },
      to: {
        path: '^packages/loutre/src/http(?:/|$)',
      },
    },
    {
      name: 'loutre-http-must-stay-runtime-neutral',
      severity: 'error',
      comment:
        '@loutrejs/loutre/http must use Web Platform APIs and must not depend on Node.js built-ins.',
      from: {
        path: '^packages/loutre/src/http(?:/|$)',
      },
      to: {
        dependencyTypes: ['core'],
      },
    },
  ],
  options: {
    parser: 'swc',
    doNotFollow: {
      path: 'node_modules',
    },
  },
}
