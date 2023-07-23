import { DfnsApiClient } from "@dfns/sdk";
import { AsymmetricKeySigner } from "@dfns/sdk-keysigner";
import { BlockchainNetwork } from '@dfns/sdk/codegen/datamodel/Foundations/index.js'
import { Contract } from "@ethersproject/contracts";
import { getDb } from "./db-manager.js";
import artifacts from '../../web3/build/contracts/Erc20VotesControlled.json' assert {
  type: 'json'
};

export default (config) => {

  const keySigner = new AsymmetricKeySigner(config.keySigner);
  const dfns = new DfnsApiClient({
    ...config.apiClient,
    signer: keySigner
  })
  
  return async (userId) => {
    const db = getDb()
    
    console.log(db)
    if (!db.data.userWallets || !db.data.userWallets[userId]) {
      throw 'You are not a member of the DAO'
    }
    
    console.log(db.data.erc20TokenAddress)
    
    try {
      const wallet = await dfns.wallets.getWallet({ walletId: db.data.userWallets[userId]});
      const contract = new Contract(db.data.erc20TokenAddress, artifacts.abi)
      const balance = await contract.balanceOf(db.data.userWallets[userId])
      wallet.balance
      console.log(balance)
      wallet.balance = balance
      return wallet;
    } catch (e) {
      console.error(e)
      throw 'Unable to gather data'
    }
  }
  
}

