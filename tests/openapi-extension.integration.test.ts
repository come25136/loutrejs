import { runOpenApiCli } from '../packages/cli/src/openapi-cli.js'
import { resolve } from 'node:path'

describe('HTTP ExtensionのOpenAPI CLI', () => {
  it.each(['hello-http', 'cors'])(
    '%sの新APIからルートとschemaを出力する',
    async (example) => {
      const output: string[] = []
      const errors: string[] = []
      const result = await runOpenApiCli(['--entry', 'src/app.ts'], {
        cwd: resolve('examples', example),
        stdout: (value) => output.push(value),
        stderr: (value) => errors.push(value),
      })
      expect(result).toBe(0)
      expect(errors).toEqual([])
      const document = JSON.parse(output[0]!)
      expect(document.openapi).toBe('3.2.0')
      expect(Object.keys(document.paths).length).toBeGreaterThan(0)
      expect(Object.keys(document.components.schemas).length).toBeGreaterThan(0)
      if (example === 'cors') {
        expect(document.paths['/messages'].options.responses['204']).toEqual({
          description: 'ok',
        })
        expect(
          document.paths['/messages'].post.requestBody.content[
            'application/json'
          ],
        ).toBeDefined()
        expect(
          document.paths['/messages'].post.responses['201'].headers[
            'x-request-id'
          ],
        ).toEqual({ schema: { type: 'string', const: 'cors-example' } })
      }
    },
  )
})
