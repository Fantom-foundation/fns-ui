import { getProvider, setupWeb3, getNetworkId, getNetwork } from './web3'
import { FNS } from './fns.js'
import { setupRegistrar } from './registrar'
export { utils, ethers } from 'ethers'

export async function setupFNS({
  customProvider,
  fnsAddress,
  reloadOnAccountsChange,
  enforceReadOnly,
  enforceReload,
  infura
} = {}) {
  const { provider } = await setupWeb3({
    customProvider,
    reloadOnAccountsChange,
    enforceReadOnly,
    enforceReload,
    infura
  })

  const network = await getNetwork()
  const fns = new FNS({ provider, networkId: network.chainId, registryAddress: fnsAddress })
  const registrar = await setupRegistrar(fns.registryAddress)
  return { fns, registrar, provider:customProvider, network }
}

export * from './fns'
export * from './registrar'
export * from './web3'
export * from './constants/interfaces'
export * from './utils'
export * from './contracts'
