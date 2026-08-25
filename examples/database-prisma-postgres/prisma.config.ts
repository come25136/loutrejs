import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.PRISMA_DATABASE_URL
      ?? 'postgres://loutre:loutre@127.0.0.1:54323/loutre_prisma',
  },
})
