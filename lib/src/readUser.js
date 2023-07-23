import { DfnsApiClient } from "@dfns/sdk";
import { AsymmetricKeySigner } from "@dfns/sdk-keysigner";
import { BlockchainNetwork } from '@dfns/sdk/codegen/datamodel/Foundations/index.js'
import { Contract } from "@ethersproject/contracts";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
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
  
  const provider = new JsonRpcProvider(process.env.DAO_RPC_URL)
  const runner = new Wallet(process.env.DAO_PRIVATE_KEY, provider)
  
  return async (userId) => {
    const db = getDb()

    if (!db.data.userWallets || !db.data.userWallets[userId]) {
      throw 'You are not a member of the DAO. Use `/dao join` command.'
    }
    
    try {
      const wallet = await dfns.wallets.getWallet({ walletId: db.data.userWallets[userId]});
      const contract = new Contract(db.data.erc20TokenAddress, artifacts.abi, runner)
      const balance = await contract.balanceOf(wallet.address)

      wallet.balance = balance
      return wallet;
    } catch (e) {
      console.error(e)
      throw 'Unable to gather data'
    }
  }
  
}

