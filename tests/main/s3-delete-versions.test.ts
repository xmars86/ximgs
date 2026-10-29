import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()

vi.mock('@aws-sdk/client-s3', () => {
  class FakeCommand {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  }
  return {
    S3Client: class {},
    DeleteObjectCommand: FakeCommand,
    HeadObjectCommand: FakeCommand,
    ListObjectVersionsCommand: FakeCommand,
    PutObjectCommand: FakeCommand,
    NodeHttpHandler: class {}
  }
})

vi.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: class {}
}))

describe('deleteObjectFileVerified (versioned buckets)', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('deletes every version and delete-marker for the exact key', async () => {
    const { deleteObjectFileVerified } = await import('../../src/main/providers/s3')
    const client = { send } as never

    const missing = Object.assign(new Error('missing'), {
      name: 'NotFound',
      $metadata: { httpStatusCode: 404 }
    })
    send
      // ListObjectVersions
      .mockResolvedValueOnce({
        Versions: [
          { Key: 'product/a.png', VersionId: 'v1' },
          { Key: 'product/a.png.bak', VersionId: 'other' }
        ],
        DeleteMarkers: [{ Key: 'product/a.png', VersionId: 'hide1' }],
        IsTruncated: false
      })
      // delete v1 + hide1
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      // headExists + stillThere
      .mockRejectedValueOnce(missing)
      .mockRejectedValueOnce(missing)

    const result = await deleteObjectFileVerified(client, 'quickimg', 'product/a.png')
    expect(result).toBe('deleted')

    const deletedVersionIds = send.mock.calls
      .map((call) => call[0]?.input)
      .filter((input) => input && 'VersionId' in input)
      .map((input) => input.VersionId)
    expect(deletedVersionIds).toEqual(['v1', 'hide1'])
  })

  it('returns already_missing when no versions and head is gone', async () => {
    const { deleteObjectFileVerified } = await import('../../src/main/providers/s3')
    const client = { send } as never
    const missing = Object.assign(new Error('missing'), {
      name: 'NoSuchKey',
      $metadata: { httpStatusCode: 404 }
    })

    send
      .mockResolvedValueOnce({ Versions: [], DeleteMarkers: [], IsTruncated: false })
      .mockRejectedValueOnce(missing)
      .mockRejectedValueOnce(missing)

    await expect(deleteObjectFileVerified(client, 'quickimg', 'product/gone.png')).resolves.toBe(
      'already_missing'
    )
  })
})
