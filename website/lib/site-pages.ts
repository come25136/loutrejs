export const sitePages = [
  { path: '/', locales: ['en', 'ja'] },
  { path: '/docs/getting-started/', locales: ['en', 'ja'] },
  { path: '/docs/graphql-codegen/', locales: ['en', 'ja'] },
  { path: '/docs/graphql-n-plus-one/', locales: ['ja'] },
  { path: '/docs/architecture/', locales: ['en', 'ja'] },
  { path: '/examples/', locales: ['en', 'ja'] },
  { path: '/features/batch-resolution/', locales: ['en', 'ja'] },
  { path: '/devtools/', locales: ['en', 'ja'] },
  { path: '/devtools/graph/', locales: ['en', 'ja'] },
  { path: '/devtools/trace/', locales: ['en', 'ja'] },
  { path: '/oss-licenses/', locales: ['en', 'ja'] },
  { path: '/privacy/', locales: ['en', 'ja'] },
] as const

export type SitePath = (typeof sitePages)[number]['path']
