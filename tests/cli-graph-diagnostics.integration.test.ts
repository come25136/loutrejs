import { runCli } from '@loutrejs/cli'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
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
        [
          'doctor',
          '--runtime',
          'electron',
          '--entry',
          'integrations/http-crud/src/app.ts',
        ],
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
    expect(stdout).toContain('managed by: module:1')
    expect(stdout).toContain('extension: @loutrejs/loutre/http')
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

  it.each([
    [
      'check',
      ['check', '--entry', 'integrations/graph-probe/src/warning-app.ts'],
    ],
    [
      'doctor',
      [
        'doctor',
        '--runtime',
        'node',
        '--entry',
        'integrations/graph-probe/src/warning-app.ts',
      ],
    ],
    [
      'graph',
      [
        'graph',
        'modules',
        '--entry',
        'integrations/graph-probe/src/warning-app.ts',
      ],
    ],
  ])('%sはwarningを表示して成功する', async (_command, args) => {
    const output = io()

    expect(await runCli(args, output.value)).toBe(0)
    expect(output.stderr.join('\n')).toContain('FIXTURE_WARNING')
  })

  it('buildはwarningを表示してApplicationを生成する', async () => {
    const output = io()
    const directory = await mkdtemp(join(tmpdir(), 'loutre-warning-build-'))
    try {
      expect(
        await runCli(
          [
            'build',
            'integrations/graph-probe/src/warning-app.ts',
            '--out-dir',
            directory,
          ],
          output.value,
        ),
      ).toBe(0)
      expect(output.stderr.join('\n')).toContain('FIXTURE_WARNING')
      expect(await readdir(directory)).toContain('application.mjs')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
