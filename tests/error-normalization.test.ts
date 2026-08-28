import { normalizeUnknownError } from '@loutrejs/loutre/runtime'

describe('Unknown Error normalization', () => {
  it('clientへ安全にmappingするためのerrorIdと内部contextを保持する', () => {
    const cause = new Error('root')
    const normalized = normalizeUnknownError(new Error('failure', { cause }), {
      module: 'UsersModule',
      procedure: 'users.get',
      executionId: 'exec-1',
    })

    expect(normalized.code).toBe('INTERNAL_ERROR')
    expect(normalized.errorId).toMatch(/^[0-9a-f-]+$/)
    expect(normalized.stack).toContain('failure')
    expect(normalized.cause).toBe(cause)
    expect(normalized.context).toEqual({
      module: 'UsersModule',
      procedure: 'users.get',
      executionId: 'exec-1',
    })
  })
})
