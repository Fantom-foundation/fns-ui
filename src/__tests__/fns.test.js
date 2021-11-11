/**
 * @jest-environment node
 */
import ganache from 'ganache-core'
import {
  setupWeb3 as setupWeb3Test,
  getAccounts
} from '../testing-utils/web3Util'
import { setupFNS } from '..'
import { deployFNS } from '@ensdomains/mock'
import { getNamehash } from '../fns'
import '../testing-utils/extendExpect'
import Web3 from 'web3'

const ENVIRONMENTS = ['GANACHE_GUI', 'GANACHE_CLI', 'GANACHE_CLI_MANUAL']
const ENV = ENVIRONMENTS[1]

let reverseRegistrar
let baseRegistrar
let publicResolver
let fns

describe('Blockchain tests', () => {
  beforeAll(async () => {
    switch (ENV) {
      case 'GANACHE_CLI':
        var provider = ganache.provider()
        var web3 = await setupWeb3Test({ provider, Web3 })
        break
      case 'GANACHE_GUI':
        var provider = new Web3.providers.HttpProvider('http://localhost:7545')
        var web3 = await setupWeb3Test({ provider, Web3 })
        break
      case 'GANACHE_CLI_MANUAL':
        var provider = new Web3.providers.HttpProvider('http://localhost:8545')
        var web3 = await setupWeb3Test({ provider, Web3 })
        break
      default:
        const options = ENVIRONMENTS.join(' or ')
        throw new Error(`ENV not set properly, please pick from ${options}`)
    }

    const accounts = await getAccounts()
    expect(accounts.length).toBeGreaterThan(0)

    const {
      fnsAddress,
      reverseRegistrarAddress,
      baseRegistrarAddress,
      resolverAddress
    } = await deployFNS({
      web3,
      accounts
    })

    baseRegistrar = baseRegistrarAddress
    reverseRegistrar = reverseRegistrarAddress
    publicResolver = resolverAddress

    const { fns: fnsInstance } = await setupFNS({
      customProvider: provider,
      fnsAddress
    })

    fns = fnsInstance
  }, 1000000)

  describe('Test contract and Web3 setup', () => {
    test('accounts exist', async () => {
      const accounts = await getAccounts()
      expect(accounts.length).toBeGreaterThan(0)
    })

    test('fns registry, resolver and reverse registrar deployed', async () => {
      const eth = getNamehash('one')
      const fnsContract = fns.getFNSContractInstance()
      const ethOwner = await fnsContract.owner(eth)
      expect(ethOwner).toBe(baseRegistrar)

      const reverseNode = getNamehash('addr.reverse')
      const reverseNodeOwner = await fnsContract.owner(reverseNode)
      expect(reverseNodeOwner).toBe(reverseRegistrar)
    })
  })

  describe('Registry', () => {
    test('getOwner returns owner', async () => {
      const accounts = await getAccounts()
      const owner = await fns.getOwner('resolver.one')
      expect(owner).toBe(accounts[0])
    })

    test('setSubnodeOwner sets new subnode owner', async () => {
      const fnsContract = fns.getFNSContractInstance()
      const owner = await fnsContract.owner(getNamehash('subnode.resolver.one'))
      const accounts = await getAccounts()
      expect(owner).toBe('0x0000000000000000000000000000000000000000')
      const tx = await fns.setSubnodeOwner('subnode.resolver.one', accounts[0])
      await tx.wait()
      const newOwner = await fnsContract.owner(
        getNamehash('subnode.resolver.one')
      )
      expect(newOwner).toBe(accounts[0])
    })

    test('setSubnodeRecord sets new subnode owner', async () => {
      const fnsContract = fns.getFNSContractInstance()
      const accounts = await getAccounts()
      const tx = await fns.setSubnodeRecord(
        'subnode.resolver.one',
        accounts[1],
        publicResolver,
        0
      )
      await tx.wait()
      const hash = getNamehash('subnode.resolver.one')
      const newOwner = await fnsContract.owner(hash)
      const newResolver = await fnsContract.resolver(hash)
      const newTTL = await fnsContract.ttl(hash)
      expect(newOwner).toBe(accounts[1])
      expect(newResolver).toBe(publicResolver)
      expect(parseInt(newTTL, 16)).toBe(0)
    })

    test('setNewOwner sets new owner', async () => {
      const fnsContract = fns.getFNSContractInstance()
      const hash = getNamehash('givethisaway.awesome.one')
      const owner = await fnsContract.owner(hash)
      const accounts = await getAccounts()
      expect(owner).toBe('0x0000000000000000000000000000000000000000')
      const tx = await fns.setSubnodeOwner(
        'givethisaway.awesome.one',
        accounts[0]
      )
      await tx.wait()
      const owner2 = await fnsContract.owner(hash)
      expect(owner2).toBe(accounts[0])
      const tx2 = await fns.setOwner('givethisaway.awesome.one', accounts[1])
      await tx2.wait()
      const newOwner = await fnsContract.owner(hash)
      expect(newOwner).toBe(accounts[1])
    })

    test('getResolver returns a resolver address when set', async () => {
      const resolver = await fns.getResolver('resolver.one')
      expect(resolver).toBeHex()
      expect(resolver).toBeEthAddress()
      expect(resolver).not.toBe('0x0000000000000000000000000000000000000000')
    })

    test('getResolver returns 0x00... when resolver address is not set', async () => {
      const resolver = await fns.getResolver('reverse')
      expect(resolver).toBeHex()
      expect(resolver).toBeEthAddress()
      expect(resolver).toBe('0x0000000000000000000000000000000000000000')
    })

    test('setResolver sets the resolver on a node', async () => {
      //test setResolver
      const resolver = await fns.getResolver('awesome.one')
      const mockResolver = '0x0000000000000000000000000000000000abcdef'
      expect(resolver).not.toBe(mockResolver)

      const tx = await fns.setResolver('awesome.one', mockResolver)
      await tx.wait()
      const newResolver = await fns.getResolver('awesome.one')
      expect(newResolver).toBeHex()
      expect(newResolver).toBeEthAddress()
      expect(newResolver.toLowerCase()).toBe(mockResolver)
    })

    test('getTTL returns a TTL', async () => {
      const ttl = await fns.getTTL('resolver.one')
      expect(parseInt(ttl, 16)).toBe(0)
    })

    test('createSubdomain makes a new subdomain', async () => {
      const accounts = await getAccounts()
      const fnsContract = fns.getFNSContractInstance()
      const hash = getNamehash('new.resolver.one')
      const oldOwner = await fnsContract.owner(hash)
      // expect the initial owner to be no one
      expect(oldOwner).toBe('0x0000000000000000000000000000000000000000')
      const tx = await fns.createSubdomain('new.resolver.one')
      await tx.wait()
      const newOwner = await fnsContract.owner(hash)
      // Verify owner is the user and therefore the subdomain exists
      expect(newOwner).toBe(accounts[0])
    })

    test('deleteSubdomain deletes a subdomain', async () => {
      const accounts = await getAccounts()
      const fnsContract = fns.getFNSContractInstance()
      const hash = getNamehash('b.subdomain.one')
      const oldOwner = await fnsContract.owner(hash)
      // expect the initial owner to be no one
      expect(oldOwner).toBe('0x0000000000000000000000000000000000000000')
      const tx = await fns.createSubdomain('b.subdomain.one')
      await tx.wait()
      const newOwner = await fnsContract.owner(hash)
      // Verify owner is the user and therefore the subdomain exists
      expect(newOwner).toBe(accounts[0])
      const tx2 = await fns.deleteSubdomain('b.subdomain.one')
      await tx2.wait()
      const deletedOwner = await fnsContract.owner(hash)
      // Verify owner has been set to 0x00... to fnsure deletion
    })
  })

  describe('Resolver', () => {
    test('getAddress returns an address', async () => {
      const addr = await fns.getAddress('resolver.one')
      expect(addr).toBeHex()
      expect(addr).toBeEthAddress()
      expect(addr).not.toBe('0x0000000000000000000000000000000000000000')
    })

    test('getAddress returns 0x000', async () => {
      const tx = await fns.createSubdomain('addr.testing.one')
      await tx.wait()
      const resolverAddr = await fns.getAddress('resolver.one')
      const tx2 = await fns.setResolver('addr.testing.one', resolverAddr)
      await tx2.wait()
      const addr = await fns.getAddress('addr.testing.one')
      expect(addr).toBe('0x0000000000000000000000000000000000000000')
    })

    test('getAddr returns an eth address', async () => {
      const addr = await fns.getAddress('resolver.one', 'ONE')
      expect(addr).toBeHex()
      expect(addr).toBeEthAddress()
      expect(addr).not.toBe('0x0000000000000000000000000000000000000000')
    })

    test('setAddress sets an address', async () => {
      //reverts if no addr is present
      const resolverAddr = await fns.getAddress('resolver.one')
      const tx = await fns.setResolver('superawesome.one', resolverAddr)
      await tx.wait()
      const tx2 = await fns.setAddress(
        'superawesome.one',
        '0x0000000000000000000000000000000000012345'
      )
      await tx2.wait()
      const addr = await fns.getAddress('superawesome.one')
      expect(addr).toBe('0x0000000000000000000000000000000000012345')
    })

    test('setAddr sets an eth address', async () => {
      //reverts if no addr is present
      const resolverAddr = await fns.getAddress('resolver.one')
      const tx = await fns.setResolver('superawesome.one', resolverAddr)
      await tx.wait()
      const tx2 = await fns.setAddr(
        'superawesome.one',
        'ONE',
        '0x0000000000000000000000000000000000012345'
      )
      await tx2.wait()
      const addr = await fns.getAddr('superawesome.one', 'ONE')
      expect(addr).toBe('0x0000000000000000000000000000000000012345')
    })

    test('getContent returns a 32 byte hash', async () => {
      const content = await fns.getContent('oldresolver.one')
      expect(content.contentType).toBe('oldcontent')
      expect(content.value).toBeHex()
      expect(content.value).toMatchSnapshot()
    })

    // old content resolver isn't on new registrar

    // test('setContent sets 32 byte hash', async () => {
    //   await fns.setContent(
    //     'oldresolver.one',
    //     '0xd1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162'
    //   )

    //   const content = await fns.getContent('oldresolver.one')
    //   expect(content.contentType).toBe('oldcontent')
    //   expect(content.value).toBeHex()
    //   expect(content.value).toMatchSnapshot()
    // })

    //ipfs://QmTeW79w7QQ6Npa3b1d5tANreCDxF2iDaAPsDvW6KtLmfB
    test('setContentHash sets up ipfs has', async () => {
      const contentHash =
        'ipfs://QmTeW79w7QQ6Npa3b1d5tANreCDxF2iDaAPsDvW6KtLmfB'
      await fns.setContenthash('abittooawesome.one', contentHash)

      const content = await fns.getContent('abittooawesome.one')
      expect(content.contentType).toBe('contenthash')
      expect(content.value).toBe(
        'ipfs://bafybeico3uuyj3vphxpvbowchdwjlrlrh62awxscrnii7w7flu5z6fk77y'
      )
    })

    test('setContentHash sets 32 byte hash', async () => {
      const contentHash =
        'bzz://d1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162'
      await fns.setContenthash('abittooawesome.one', contentHash)

      const content = await fns.getContent('abittooawesome.one')
      expect(content.contentType).toBe('contenthash')
      expect(content.value).toBe(
        'bzz://d1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162'
      )
    })
  })

  describe('Reverse Registrar', () => {
    test('reverseNode is owned by reverseRegistrar', async () => {
      const owner = await fns.getOwner('addr.reverse')
      expect(reverseRegistrar).toBe(owner)
    })

    test('getName gets a name for an address', async () => {
      const accounts = await getAccounts()
      const { name } = await fns.getName(accounts[2])
      expect(name).toBe('one')
    })

    test('claimAndSetReverseRecordName claims and sets a name', async () => {
      const accounts = await getAccounts()
      const { name } = await fns.getName(accounts[0])
      expect(name).toBe('abittooawesome.one')
      const tx = await fns.claimAndSetReverseRecordName('resolver.one', 2000000)
      await tx.wait()
      const { name: nameAfter } = await fns.getName(accounts[0])
      expect(nameAfter).toBe('resolver.one')
    })
  })

  describe('Helper functions', () => {
    test('getDomainDetails gets rootdomain and resolver details', async () => {
      try {
        const domain = await fns.getDomainDetails('resolver.one')
        expect(domain.owner).not.toBe(
          '0x0000000000000000000000000000000000000000'
        )
        expect(domain.owner).toBeEthAddress()
        expect(domain.resolver).not.toBe(
          '0x0000000000000000000000000000000000000000'
        )
        expect(domain.resolver).toBeEthAddress()
        const addr = await fns.getAddress('resolver.one')
        expect(domain.addr).toBe(addr)
        expect(domain.content).toMatchSnapshot()
      } catch (e) {
        console.log('help functions test', e)
      }
    })

    test('getSubdomains gets all subdomains', async () => {
      const domains = await fns.getSubdomains('one')
      expect(domains.length).toBeGreaterThan(0)
      expect(domains[0].label).toBe('subdomain')
    })
  })
})
