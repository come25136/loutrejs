import { ReplayCapsuleStore } from '@loutrejs/loutre/devtools'

describe('ReplayCapsuleStore', () => {
  const observation = {
    executionId: 'task.example',
    executionKind: 'task.invocation',
    graphNodeId: 'task.example',
    name: 'example',
  } as const

  it('plain inputはsnapshotとして保持し元objectのmutationから分離する', async () => {
    const input = { nested: { value: 1 } }
    let replayed: unknown
    const store = new ReplayCapsuleStore('run_test')
    const capsule = store.createExecution('trace_1', 'span_1', observation, {
      input,
      replay(value) {
        replayed = value
        return value
      },
    })

    input.nested.value = 99
    const result = await store.replay({
      requestId: 'request_1',
      capsuleId: capsule.id,
    })

    expect(capsule.fidelity).toBe('snapshot')
    expect(replayed).toEqual({ nested: { value: 1 } })
    expect(result).toMatchObject({
      status: 'ok',
      result: { value: { nested: { value: 1 } } },
    })
  })

  it('accessor付きinputはgetterを評価せずlive referenceとして保持する', async () => {
    let getterReads = 0
    const input = {
      value: 1,
      get dangerous() {
        getterReads += 1
        throw new Error('getter must not run')
      },
    }
    const store = new ReplayCapsuleStore('run_test')
    const capsule = store.createExecution('trace_1', 'span_1', observation, {
      input,
      replay: (value) => value,
    })

    expect(capsule.fidelity).toBe('reference')
    expect(capsule.input).toMatchObject({ truncated: true })
    expect(getterReads).toBe(0)
  })

  it('class instanceはlive referenceとして保持しJSON化でsemanticsを変えない', async () => {
    class Input {
      constructor(public value: number) {}
      read() {
        return this.value
      }
    }
    const input = new Input(1)
    let replayed: unknown
    const store = new ReplayCapsuleStore('run_test')
    const capsule = store.createExecution('trace_1', 'span_1', observation, {
      input,
      replay(value) {
        replayed = value
        return value instanceof Input ? value.read() : -1
      },
    })

    input.value = 7
    const result = await store.replay({
      requestId: 'request_1',
      capsuleId: capsule.id,
    })

    expect(capsule.fidelity).toBe('reference')
    expect(replayed).toBe(input)
    expect(result).toMatchObject({ status: 'ok', result: { value: 7 } })
  })

  it('maxCapsulesを超えた古いcapsuleをevictする', async () => {
    const store = new ReplayCapsuleStore('run_test', { maxCapsules: 1 })
    const first = store.createExecution('trace_1', 'span_1', observation, {
      input: 1,
      replay: (value) => value,
    })
    const second = store.createExecution('trace_2', 'span_2', observation, {
      input: 2,
      replay: (value) => value,
    })

    await expect(
      store.replay({ requestId: 'old', capsuleId: first.id }),
    ).resolves.toMatchObject({ status: 'error' })
    await expect(
      store.replay({ requestId: 'new', capsuleId: second.id }),
    ).resolves.toMatchObject({ status: 'ok', result: { value: 2 } })
  })

  it('previewだけredactしraw snapshotはApplication process内のreplayに使える', async () => {
    const store = new ReplayCapsuleStore('run_test', {
      redact: ['password'],
    })
    let replayed: unknown
    const capsule = store.createExecution('trace_1', 'span_1', observation, {
      input: { user: 'loutre', password: 'secret' },
      replay(value) {
        replayed = value
        return undefined
      },
    })

    expect(capsule.input).toMatchObject({
      redacted: true,
      value: {
        user: 'loutre',
        password: { $type: 'redacted' },
      },
    })
    await store.replay({ requestId: 'request_1', capsuleId: capsule.id })
    expect(replayed).toEqual({ user: 'loutre', password: 'secret' })
  })
})
