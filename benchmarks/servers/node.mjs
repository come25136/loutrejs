import { createServer } from 'node:http'

const port = Number(process.env.BENCHMARK_PORT ?? 43111)
const body = JSON.stringify({ id: 'benchmark', name: 'test' })
const server = createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/users/benchmark') {
    response.statusCode = 404
    response.end()
    return
  }
  response.statusCode = 200
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(body)
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`BENCHMARK_READY http://127.0.0.1:${port}\n`)
})

let closing = false
function close() {
  if (closing) return
  closing = true
  server.close((error) => {
    if (error) {
      console.error(error)
      process.exitCode = 1
    }
  })
}

process.once('SIGINT', close)
process.once('SIGTERM', close)
