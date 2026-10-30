import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { send, commandInputs } = vi.hoisted(() => ({
  send: vi.fn(),
  commandInputs: [] as unknown[]
}))

vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: class {
    send = send
  },
  DescribeAddressesCommand: class {
    constructor(input: unknown) {
      commandInputs.push(input)
    }
  }
}))

import { handler } from '../src/handler'

describe('handler', () => {
  beforeEach(() => {
    send.mockReset()
    commandInputs.length = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requests all addresses and maps associated and unassociated addresses', async () => {
    send.mockResolvedValue({ Addresses: [
      { AllocationId: 'eipalloc-1', PublicIp: '203.0.113.1', Domain: 'vpc', AssociationId: 'eipassoc-1', InstanceId: 'i-1', NetworkInterfaceId: 'eni-1', PrivateIpAddress: '10.0.0.1', Extra: 'ignored' },
      { AllocationId: 'eipalloc-2', PublicIp: '203.0.113.2', Domain: 'vpc' }
    ] })

    const response = await handler()

    expect(send).toHaveBeenCalledOnce()
    expect(commandInputs).toEqual([{}])
    expect(response.statusCode).toBe(200)
    expect(response.headers).toEqual({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    expect(JSON.parse(response.body)).toEqual({ elasticIps: [
      { allocationId: 'eipalloc-1', publicIp: '203.0.113.1', domain: 'vpc', associationId: 'eipassoc-1', instanceId: 'i-1', networkInterfaceId: 'eni-1', privateIpAddress: '10.0.0.1', associated: true },
      { allocationId: 'eipalloc-2', publicIp: '203.0.113.2', domain: 'vpc', associated: false }
    ] })
    expect(console.error).not.toHaveBeenCalled()
    expect(console.log).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
  })

  it.each([undefined, null, []])('returns an empty list when addresses are %s', async addresses => {
    send.mockResolvedValue({ Addresses: addresses })
    const response = await handler()
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ elasticIps: [] })
  })

  it('treats an empty association ID as unassociated and preserves it', async () => {
    send.mockResolvedValue({ Addresses: [{ AssociationId: '' }] })
    const response = await handler()
    expect(JSON.parse(response.body)).toEqual({ elasticIps: [{ associationId: '', associated: false }] })
  })

  it.each([
    ['a rejected AWS call', () => send.mockRejectedValue(new Error('service unavailable'))],
    ['a malformed addresses value', () => send.mockResolvedValue({ Addresses: {} })],
    ['a null address', () => send.mockResolvedValue({ Addresses: [null] })],
    ['a missing response', () => send.mockResolvedValue(undefined)]
  ])('returns a generic error for %s', async (_description, configure) => {
    configure()
    const response = await handler()
    expect(response).toEqual({
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error in getElasticIps lambda' })
    })
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('does not expose an AWS error in the response', async () => {
    send.mockRejectedValue(new Error('secret-token-123'))
    const response = await handler()
    expect(response.body).not.toContain('secret-token-123')
  })

  it('does not write sensitive AWS error details to logs', async () => {
    send.mockRejectedValue(new Error('secret-token-123'))
    await handler()
    expect(console.error).toHaveBeenCalledExactlyOnceWith('Failed to list Elastic IPs')
    for (const logger of [console.error, console.log, console.warn]) {
      expect(JSON.stringify(vi.mocked(logger).mock.calls, Object.getOwnPropertyNames(new Error('secret-token-123')))).not.toContain('secret-token-123')
    }
  })
})
