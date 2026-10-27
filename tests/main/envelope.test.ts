import { describe, expect, it } from 'vitest'
import { okResponse, errorResponse } from '../../src/main/ipc/envelope'
import { AppError } from '../../src/shared/errors'
import { dispatchInvoke } from '../../src/main/ipc/router'

describe('IPC envelope', () => {
  it('builds ok response', () => {
    const res = okResponse('r1', { hello: 'world' })
    expect(res).toEqual({ requestId: 'r1', ok: true, data: { hello: 'world' } })
  })

  it('maps AppError to error payload', () => {
    const res = errorResponse('r2', new AppError('TEST_CODE', 'boom'))
    expect(res.ok).toBe(false)
    expect(res.error).toEqual({ code: 'TEST_CODE', message: 'boom' })
  })
})

describe('IPC router', () => {
  it('rejects missing requestId', async () => {
    const res = await dispatchInvoke({
      method: 'system.ping',
      requestId: '',
      data: undefined
    })
    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe('INVALID_REQUEST')
  })

  it('rejects unknown method', async () => {
    const unknown = await dispatchInvoke({
      // @ts-expect-error intentional unknown method
      method: 'no.such.method',
      requestId: 'r4'
    })
    expect(unknown.ok).toBe(false)
    expect(unknown.error?.code).toBe('UNKNOWN_METHOD')
  })
})
