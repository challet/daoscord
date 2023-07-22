import {JsonRpcProvider} from "@ethersproject/providers";
import {Wallet} from "@ethersproject/wallet";
import {ContractFactory} from "@ethersproject/contracts";
import * as fs from "fs";

export class TokenService {

    public async deployToken(): Promise<string> {
        console.log('Deploy token...')
        const provider = new JsonRpcProvider(process.env.RPC_URL)
        const wallet = new Wallet(process.env.DAOSCORD_PRIVATE_KEY, provider)

        const compilerOutput = fs.readFileSync('web3/build/contracts/Erc20VotesControlled.json')
        const contractFactory = ContractFactory.fromSolidity({}, wallet)
        const contract = await contractFactory.deploy('DeFi France', 'DFF', { gasLimit: 1 * 10 ** 6 })
        console.log(`Deployed token at ${contract.address}`)
        return contract.address
    }
}