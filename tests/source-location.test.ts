import { getSourceLocation, registerSourceLocation } from '@loutrejs/loutre'

describe('Source location metadata', () => {
  it('同一identityへの後続registrationで定義元を上書きしない', () => {
    class RealService {}
    registerSourceLocation(RealService, { file: 'real.ts', line: 1, column: 1 })
    const Alias = RealService
    registerSourceLocation(Alias, { file: 'alias.ts', line: 2, column: 1 })

    expect(getSourceLocation(RealService)).toEqual({
      file: 'real.ts',
      line: 1,
      column: 1,
    })
  })
})
