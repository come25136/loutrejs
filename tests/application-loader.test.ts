import { resolve } from 'node:path'
import { loadApplicationDefinition } from '../packages/cli/src/application-loader.js'
import { loadEntry } from '../packages/cli/src/entry-loader.js'

const fixtures = resolve('tests', 'fixtures')

describe('Application entry loader', () => {
  it('undefinedのdefault exportをentryとして拒否する', async () => {
    await expect(
      loadEntry(resolve(fixtures, 'undefined-entry.ts'), {
        projectRoot: process.cwd(),
      }),
    ).rejects.toThrow('Loutre entry must have a default export.')
  })

  it('named application exportへfallbackしない', async () => {
    await expect(
      loadApplicationDefinition(
        resolve(fixtures, 'named-application-entry.ts'),
        {
          projectRoot: process.cwd(),
        },
      ),
    ).rejects.toThrow('Loutre entry must have a default export.')
  })

  it('HttpContractはApplication entryとして受け付けない', async () => {
    await expect(
      loadApplicationDefinition(
        resolve('integrations', 'openapi-contract', 'src', 'api.ts'),
        { projectRoot: process.cwd() },
      ),
    ).rejects.toThrow(
      'Application entry must default export an ApplicationDefinition.',
    )
  })
})
