import { runCli } from '@loutrefw/cli'

describe('Loutre CLI', () => {
  function io() {
    const stdout: string[] = []
    const stderr: string[] = []
    return {
      stdout,
      stderr,
      value: {
        cwd: process.cwd(),
        stdout: (message: string) => stdout.push(message),
        stderr: (message: string) => stderr.push(message),
      },
    }
  }

  it('Contract/Pipeline Graphを表示する', async () => {
    const output = io()
    expect(await runCli(['graph', 'contracts'], output.value)).toBe(0)
    expect(output.stdout.join('\n')).toContain('UsersContract.get [http]')
    expect(output.stdout.join('\n')).toContain('http.controller terminal')
  })

  it('Runtime capability mismatchをdoctorで説明する', async () => {
    const output = io()
    const code = await runCli(['doctor', 'electron'], output.value)
    expect(code).toBe(1)
    expect(output.stdout.join('\n')).toContain('Missing: http.server')
  })

  it('constructor dependencyをexplainする', async () => {
    const output = io()
    expect(await runCli(['explain', 'Service'], output.value)).toBe(0)
    expect(output.stdout.join('\n')).toContain('repository <- Repository')
  })

  it('Module lifecycleとexportsをGraphへ表示する', async () => {
    const output = io()
    expect(await runCli(['graph', 'modules'], output.value)).toBe(0)
    const graph = output.stdout.join('\n')
    expect(graph).toContain('DatabaseModule')
    expect(graph).toContain('lifecycle: onModuleInit')
    expect(graph).toContain('exports: args.provide')
  })
})
