import { runCli } from '@loutrejs/cli'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('Graph-driven CLI diagnostics', () => {
  function io() {
    const stdout: string[] = []
    const stderr: string[] = []
    return {
      stdout,
      stderr,
      value: {
        cwd: process.cwd(),
        stdout: (value: string) => stdout.push(value),
        stderr: (value: string) => stderr.push(value),
      },
    }
  }

  it('doctorがApplication summaryとmissing capabilityの要求元を表示する', async () => {
    const output = io()

    expect(
      await runCli(
        ['doctor', 'electron', '--entry', 'integrations/http-crud/src/app.ts'],
        output.value,
      ),
    ).toBe(1)

    const stdout = output.stdout.join('\n')
    expect(stdout).toContain('Application:')
    expect(stdout).toContain('Graph: valid')
    expect(stdout).toContain('Capability reasons:')
    expect(stdout).toContain('http.server:')
  })

  it('explainがModule visibilityとdependency treeを表示する', async () => {
    const output = io()

    expect(
      await runCli(
        [
          'explain',
          'UsersController',
          '--entry',
          'integrations/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(0)

    const stdout = output.stdout.join('\n')
    expect(stdout).toContain('visibility: private')
    expect(stdout).toContain('dependency graph:')
    expect(stdout).toContain('UsersService')
  })

  it('buildがtargetとApplication summaryを表示する', async () => {
    const output = io()
    const directory = await mkdtemp(join(tmpdir(), 'loutre-build-summary-'))
    try {
      expect(
        await runCli(
          [
            'build',
            'integrations/http-crud/src/app.ts',
            '--runtime',
            'cloudflare-workers',
            '--out-dir',
            directory,
          ],
          output.value,
        ),
      ).toBe(0)
      const stdout = output.stdout.join('\n')
      expect(stdout).toContain('Application:')
      expect(stdout).toContain('Target: cloudflare-workers')
      expect(stdout).toContain('Diagnostics: 0')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
