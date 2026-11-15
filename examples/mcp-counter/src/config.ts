export const port = Number(process.env.PORT ?? 3010)
export const mcpPath = '/mcp'
export const endpoint = new URL(mcpPath, `http://127.0.0.1:${port}`)
