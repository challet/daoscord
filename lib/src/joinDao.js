import { DfnsApiClient } from "@dfns/sdk";
import { AsymmetricKeySigner } from "@dfns/sdk-keysigner";
import { BlockchainNetwork } from '@dfns/sdk/codegen/datamodel/Foundations/index.js'
import { getDb } from "./db-manager.js";

export default (config) => {

  const keySigner = new AsymmetricKeySigner(config.keySigner);
  const dfns = new DfnsApiClient({
    ...config.apiClient,
    signer: keySigner
  })
  
  return async (userId) => {
    const db = getDb()
    
    if (db.data.userWallets && db.data.userWallets[userId]) {
      throw 'You already are a member of the DAO'
    }

    try {
      const wallet = await dfns.wallets.createWallet({ body: { 
        network: 'PolygonMumbai',
        name: userId
      }});
      db.data.userWallets = { ...db.data.userWallets || {}, [userId]: wallet.id }
      return wallet;
    } catch (e) {
      console.error(e)
      throw 'Unable to create membership wallet'
    }
  }
  
}

