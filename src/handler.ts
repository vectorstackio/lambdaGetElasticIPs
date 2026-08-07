// handler.ts

import {
  EC2Client,
  DescribeAddressesCommand
} from '@aws-sdk/client-ec2'

const ec2 = new EC2Client({})

export async function handler() {
  try {
    const result =
      await ec2.send(
        new DescribeAddressesCommand({})
      )

    const elasticIps =
      (result.Addresses ?? [])
        .map(address => ({
          allocationId: address.AllocationId,
          publicIp: address.PublicIp,
          domain: address.Domain,
          associationId: address.AssociationId,
          instanceId: address.InstanceId,
          networkInterfaceId:
            address.NetworkInterfaceId,
          privateIpAddress:
            address.PrivateIpAddress,

          // This is the important field
          // No association means this EIP is unused
          associated:
            Boolean(address.AssociationId)
        }))

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        elasticIps
      })
    }

  } catch (err) {
    console.error(
      'Failed to list Elastic IPs:',
      err
    )

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Internal server error in getElasticIps lambda'
      })
    }
  }
}