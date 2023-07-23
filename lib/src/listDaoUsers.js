import { DfnsApiClient } from "@dfns/sdk";
import { AsymmetricKeySigner } from "@dfns/sdk-keysigner";
import { BlockchainNetwork } from '@dfns/sdk/codegen/datamodel/Foundations/index.js'

export default (config) => {

  const keySigner = new AsymmetricKeySigner(config.keySigner);
  const dfns = new DfnsApiClient({
    ...config.apiClient,
    signer: keySigner
  })
  
  return async (userId) => {
    try {
      return await dfns.wallets.listWallets({});
    } catch (e) {
      console.error(e)
    }
  }
  
}

