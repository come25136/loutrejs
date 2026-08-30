export const scenarios = [
  {
    name: 'loutre',
    command: process.execPath,
    args: ['benchmarks/servers/loutre.mjs'],
    port: 43110,
    path: '/users/benchmark',
  },
  {
    name: 'node',
    command: process.execPath,
    args: ['benchmarks/servers/node.mjs'],
    port: 43111,
    path: '/users/benchmark',
  },
]
