import has from 'lodash/has'
import { Contract, utils } from 'ethers'
import {
  getWeb3,
  getNetworkId,
  getProvider,
  getAccount,
  getSigner
} from './web3'
import { formatsByName } from '@ensdomains/address-encoder'
import { abi as fnsContract } from '@ensdomains/contracts/abis/ens/ENS.json'

import { decryptHashes } from './preimage'

import {
  uniq,
  getEnsStartBlock,
  checkLabels,
  mergeLabels,
  emptyAddress,
  isDecrypted,
  namehash,
  labelhash
} from './utils'
import { encodeLabelhash } from './utils/labelhash'

import {
  getTestRegistrarContract,
  getReverseRegistrarContract,
  getFNSContract,
  getResolverContract,
  getOldResolverContract
} from './contracts'

import {
  isValidContenthash,
  encodeContenthash,
  decodeContenthash
} from './utils/contents'

/* Utils */

export function getNamehash(name) {
  return namehash(name)
}

async function getNamehashWithLabelHash(labelHash, nodeHash) {
  let node = utils.keccak256(nodeHash + labelHash.slice(2))
  return node.toString()
}

function getLabelhash(label) {
  return labelhash(label)
}

const contracts = {
  // 1: {
  //   registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
  // },
  // 3: {
  //   registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
  // },
  // 4: {
  //   registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
  // },
  // 5: {
  //   registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
  // },
  4002: {
    registry: '0x7ab9cf80efb603938Ed723202c5Cbf80DD653217'
  },
  1666700000: {
    registry: '0x23ca23b6f2C40BF71fe4Da7C5d6396EE2C018e6A'
  },
  1666600000: {
    registry: '0x3fa4135B88cE1035Fed373F0801118a3340B37e7'
  }
}

export class FNS {
  constructor({ networkId, registryAddress, provider }) {
    this.contracts = contracts
    const hasRegistry = has(this.contracts[networkId], 'registry')

    if (!hasRegistry && !registryAddress) {
      throw new Error(`Unsupported network ${networkId}`)
    } else if (this.contracts[networkId] && !registryAddress) {
      registryAddress = contracts[networkId].registry
    }

    this.registryAddress = registryAddress

    const FNSContract = getFNSContract({ address: registryAddress, provider })
    this.FNS = FNSContract
  }

  /* Get the raw Ethers contract object */
  getFNSContractInstance() {
    return this.FNS
  }

  /* Main methods */

  async getOwner(name) {
    const namehash = getNamehash(name)
    const owner = await this.FNS.owner(namehash)
    return owner
  }

  async getResolver(name) {
    const namehash = getNamehash(name)
    return this.FNS.resolver(namehash)
  }

  async getTTL(name) {
    const namehash = getNamehash(name)
    return this.FNS.ttl(namehash)
  }

  async getResolverWithLabelhash(labelhash, nodehash) {
    const namehash = await getNamehashWithLabelHash(labelhash, nodehash)
    return this.FNS.resolver(namehash)
  }

  async getOwnerWithLabelHash(labelhash, nodeHash) {
    const namehash = await getNamehashWithLabelHash(labelhash, nodeHash)
    return this.FNS.owner(namehash)
  }

  async getEthAddressWithResolver(name, resolverAddr) {
    if (parseInt(resolverAddr, 16) === 0) {
      return emptyAddress
    }
    const namehash = getNamehash(name)
    try {
      const provider = await getProvider()
      const Resolver = getResolverContract({
        address: resolverAddr,
        provider
      })
      const addr = await Resolver['addr(bytes32)'](namehash)
      return addr
    } catch (e) {
      console.warn(
        'Error getting addr on the resolver contract, are you sure the resolver address is a resolver contract?'
      )
      return emptyAddress
    }
  }

  async getAddress(name) {
    const resolverAddr = await this.getResolver(name)
    return this.getEthAddressWithResolver(name, resolverAddr)
  }

  async getAddr(name, key) {
    const resolverAddr = await this.getResolver(name)
    if (parseInt(resolverAddr, 16) === 0) return emptyAddress
    return this.getAddrWithResolver(name, key, resolverAddr)
  }

  async getAddrWithResolver(name, key, resolverAddr) {
    const namehash = getNamehash(name)
    try {
      const provider = await getProvider()
      const Resolver = getResolverContract({
        address: resolverAddr,
        provider
      })
      const { coinType, encoder } = formatsByName[key]
      const addr = await Resolver['addr(bytes32,uint256)'](namehash, coinType)
      if (addr === '0x') return emptyAddress

      return encoder(Buffer.from(addr.slice(2), 'hex'))
    } catch (e) {
      console.log(e)
      console.warn(
        'Error getting addr on the resolver contract, are you sure the resolver address is a resolver contract?'
      )
      return emptyAddress
    }
  }

  async getContent(name) {
    const resolverAddr = await this.getResolver(name)
    return this.getContentWithResolver(name, resolverAddr)
  }

  async getContentWithResolver(name, resolverAddr) {
    if (parseInt(resolverAddr, 16) === 0) {
      return emptyAddress
    }
    try {
      const namehash = getNamehash(name)
      const provider = await getProvider()
      const Resolver = getResolverContract({
        address: resolverAddr,
        provider
      })
      const contentHashSignature = utils
        .solidityKeccak256(['string'], ['contenthash(bytes32)'])
        .slice(0, 10)

      const isContentHashSupported = await Resolver.supportsInterface(
        contentHashSignature
      )

      if (isContentHashSupported) {
        const encoded = await Resolver.contenthash(namehash)
        const { protocolType, decoded, error } = decodeContenthash(encoded)
        if (error) {
          return {
            value: error,
            contentType: 'error'
          }
        }
        return {
          value: `${protocolType}://${decoded}`,
          contentType: 'contenthash'
        }
      } else {
        const value = await Resolver.content(namehash)
        return {
          value,
          contentType: 'oldcontent'
        }
      }
    } catch (e) {
      const message =
        'Error getting content on the resolver contract, are you sure the resolver address is a resolver contract?'
      console.warn(message, e)
      return { value: message, contentType: 'error' }
    }
  }

  async getText(name, key) {
    const resolverAddr = await this.getResolver(name)
    return this.getTextWithResolver(name, key, resolverAddr)
  }

  async getTextWithResolver(name, key, resolverAddr) {
    if (parseInt(resolverAddr, 16) === 0) {
      return ''
    }
    const namehash = getNamehash(name)
    try {
      const provider = await getProvider()
      const Resolver = getResolverContract({
        address: resolverAddr,
        provider
      })
      const addr = await Resolver.text(namehash, key)
      return addr
    } catch (e) {
      console.warn(
        'Error getting text record on the resolver contract, are you sure the resolver address is a resolver contract?'
      )
      return ''
    }
  }

  async getName(address) {
    const reverseNode = `${address.slice(2)}.addr.reverse`
    const resolverAddr = await this.getResolver(reverseNode)
    return this.getNameWithResolver(address, resolverAddr)
  }

  async getNameWithResolver(address, resolverAddr) {
    const reverseNode = `${address.slice(2)}.addr.reverse`
    const reverseNamehash = getNamehash(reverseNode)
    if (parseInt(resolverAddr, 16) === 0) {
      return {
        name: null
      }
    }

    try {
      const provider = await getProvider()
      const Resolver = getResolverContract({
        address: resolverAddr,
        provider
      })
      const name = await Resolver.name(reverseNamehash)
      return {
        name
      }
    } catch (e) {
      console.log(`Error getting name for reverse record of ${address}`, e)
    }
  }

  async isMigrated(name) {
    const namehash = getNamehash(name)
    return this.FNS.recordExists(namehash)
  }

  async getResolverDetails(node) {
    try {
      const addrPromise = this.getAddress(node.name)
      const contentPromise = this.getContent(node.name)
      const [addr, content] = await Promise.all([addrPromise, contentPromise])
      return {
        ...node,
        addr,
        content: content.value,
        contentType: content.contentType
      }
    } catch (e) {
      return {
        ...node,
        addr: '0x0',
        content: '0x0',
        contentType: 'error'
      }
    }
  }

  async getSubdomains(name) {
    const startBlock = await getEnsStartBlock()
    const namehash = getNamehash(name)
    const rawLogs = await this.getFNSEvent('NewOwner', {
      topics: [namehash],
      fromBlock: startBlock
    })
    const flattenedLogs = rawLogs.map((log) => log.args)
    flattenedLogs.reverse()
    const logs = uniq(flattenedLogs, 'label')
    const labelhashes = logs.map((log) => log.label)
    const remoteLabels = await decryptHashes(...labelhashes)
    const localLabels = checkLabels(...labelhashes)
    const labels = mergeLabels(localLabels, remoteLabels)
    const ownerPromises = labels.map((label) =>
      this.getOwner(`${label}.${name}`)
    )

    return Promise.all(ownerPromises).then((owners) =>
      owners.map((owner, index) => {
        return {
          label: labels[index],
          labelhash: logs[index].label,
          decrypted: labels[index] !== null,
          node: name,
          name: `${labels[index] || encodeLabelhash(logs[index].label)
            }.${name}`,
          owner
        }
      })
    )
  }

  async getDomainDetails(name) {
    const nameArray = name.split('.')
    const labelhash = getLabelhash(nameArray[0])
    const [owner, resolver] = await Promise.all([
      this.getOwner(name),
      this.getResolver(name)
    ])
    const node = {
      name,
      label: nameArray[0],
      labelhash,
      owner,
      resolver
    }

    const hasResolver = parseInt(node.resolver, 16) !== 0

    if (hasResolver) {
      return this.getResolverDetails(node)
    }

    return {
      ...node,
      addr: null,
      content: null
    }
  }

  /* non-constant functions */

  async setOwner(name, newOwner) {
    const FNSWithoutSigner = this.FNS
    const signer = await getSigner()
    const FNS = FNSWithoutSigner.connect(signer)
    const namehash = getNamehash(name)
    return FNS.setOwner(namehash, newOwner)
  }

  async setSubnodeOwner(name, newOwner) {
    const FNSWithoutSigner = this.FNS
    const signer = await getSigner()
    const FNS = FNSWithoutSigner.connect(signer)
    const nameArray = name.split('.')
    const label = nameArray[0]
    const node = nameArray.slice(1).join('.')
    const labelhash = getLabelhash(label)
    const parentNamehash = getNamehash(node)
    return FNS.setSubnodeOwner(parentNamehash, labelhash, newOwner)
  }

  async setSubnodeRecord(name, newOwner, resolver) {
    const FNSWithoutSigner = this.FNS
    const signer = await getSigner()
    const FNS = FNSWithoutSigner.connect(signer)
    const nameArray = name.split('.')
    const label = nameArray[0]
    const node = nameArray.slice(1).join('.')
    const labelhash = getLabelhash(label)
    const parentNamehash = getNamehash(node)
    const ttl = await this.getTTL(name)
    return FNS.setSubnodeRecord(
      parentNamehash,
      labelhash,
      newOwner,
      resolver,
      ttl
    )
  }

  async setResolver(name, resolver) {
    const namehash = getNamehash(name)
    const FNSWithoutSigner = this.FNS
    const signer = await getSigner()
    const FNS = FNSWithoutSigner.connect(signer)
    return FNS.setResolver(namehash, resolver)
  }

  async setAddress(name, address) {
    const resolverAddr = await this.getResolver(name)
    return this.setAddressWithResolver(name, address, resolverAddr)
  }

  async setAddressWithResolver(name, address, resolverAddr) {
    const namehash = getNamehash(name)
    const provider = await getProvider()
    const ResolverWithoutSigner = getResolverContract({
      address: resolverAddr,
      provider
    })
    const signer = await getSigner()
    const Resolver = ResolverWithoutSigner.connect(signer)
    return Resolver['setAddr(bytes32,address)'](namehash, address)
  }

  async setAddr(name, key, address) {
    const resolverAddr = await this.getResolver(name)
    return this.setAddrWithResolver(name, key, address, resolverAddr)
  }

  async setAddrWithResolver(name, key, address, resolverAddr) {
    const namehash = getNamehash(name)
    const provider = await getProvider()
    const ResolverWithoutSigner = getResolverContract({
      address: resolverAddr,
      provider
    })
    const signer = await getSigner()
    const Resolver = ResolverWithoutSigner.connect(signer)
    const { decoder, coinType } = formatsByName[key]
    let addressAsBytes
    if (!address || address === '') {
      addressAsBytes = Buffer.from('')
    } else {
      addressAsBytes = decoder(address)
    }
    return Resolver['setAddr(bytes32,uint256,bytes)'](
      namehash,
      coinType,
      addressAsBytes
    )
  }

  async setContent(name, content) {
    const resolverAddr = await this.getResolver(name)
    return this.setContentWithResolver(name, content, resolverAddr)
  }

  async setContentWithResolver(name, content, resolverAddr) {
    const namehash = getNamehash(name)
    const provider = await getProvider()
    const ResolverWithoutSigner = getResolverContract({
      address: resolverAddr,
      provider
    })
    const signer = await getSigner()
    const Resolver = ResolverWithoutSigner.connect(signer)
    return Resolver.setContent(namehash, content)
  }

  async setContenthash(name, content) {
    const resolverAddr = await this.getResolver(name)
    return this.setContenthashWithResolver(name, content, resolverAddr)
  }

  async setContenthashWithResolver(name, content, resolverAddr) {
    let encodedContenthash = content
    if (parseInt(content, 16) !== 0) {
      encodedContenthash = encodeContenthash(content)
    }
    const namehash = getNamehash(name)
    const provider = await getProvider()
    const ResolverWithoutSigner = getResolverContract({
      address: resolverAddr,
      provider
    })
    const signer = await getSigner()
    const Resolver = ResolverWithoutSigner.connect(signer)
    return Resolver.setContenthash(namehash, encodedContenthash)
  }

  async setText(name, key, recordValue) {
    const resolverAddr = await this.getResolver(name)
    return this.setTextWithResolver(name, key, recordValue, resolverAddr)
  }

  async setTextWithResolver(name, key, recordValue, resolverAddr) {
    const namehash = getNamehash(name)
    const provider = await getProvider()
    const ResolverWithoutSigner = getResolverContract({
      address: resolverAddr,
      provider
    })
    const signer = await getSigner()
    const Resolver = ResolverWithoutSigner.connect(signer)
    return Resolver.setText(namehash, key, recordValue)
  }

  async createSubdomain(name) {
    const account = await getAccount()
    const publicResolverAddress = await this.getAddress('resolver.ftm')
    try {
      return this.setSubnodeRecord(name, account, publicResolverAddress)
    } catch (e) {
      console.log('error creating subdomain', e)
    }
  }

  async deleteSubdomain(name) {
    try {
      return this.setSubnodeRecord(name, emptyAddress, emptyAddress)
    } catch (e) {
      console.log('error deleting subdomain', e)
    }
  }

  async claimAndSetReverseRecordName(name, overrides = {}) {
    const reverseRegistrarAddr = await this.getOwner('addr.reverse')
    const provider = await getProvider(0)
    const reverseRegistrarWithoutSigner = getReverseRegistrarContract({
      address: reverseRegistrarAddr,
      provider
    })
    const signer = await getSigner()
    const reverseRegistrar = reverseRegistrarWithoutSigner.connect(signer)
    const networkId = await getNetworkId()

    // if (parseInt(networkId) > 1000) {
    //   const gasLimit = await reverseRegistrar.estimate.setName(name)
    //   overrides = {
    //     gasLimit: gasLimit.toNumber() * 2,
    //     ...overrides
    //   }
    // }

    return reverseRegistrar.setName(name, overrides)
  }

  async setReverseRecordName(name) {
    const account = await getAccount()
    const provider = await getProvider()
    const reverseNode = `${account.slice(2)}.addr.reverse`
    const resolverAddr = await this.getResolver(reverseNode)
    const ResolverWithoutSigner = getResolverContract({
      address: resolverAddr,
      provider
    })
    const signer = await getSigner()
    const Resolver = ResolverWithoutSigner.connect(signer)
    let namehash = getNamehash(reverseNode)
    return Resolver.setName(namehash, name)
  }

  // Events

  async getFNSEvent(event, { topics, fromBlock }) {
    const provider = await getWeb3()
    const { FNS } = this
    const fnsInterface = new utils.Interface(fnsContract)
    let Event = FNS.filters[event]()

    const filter = {
      fromBlock,
      toBlock: 'latest',
      address: Event.address,
      topics: [...Event.topics, ...topics]
    }

    const logs = await provider.getLogs(filter)

    const parsed = logs.map((log) => {
      const parsedLog = fnsInterface.parseLog(log)
      return parsedLog
    })

    return parsed
  }
}
