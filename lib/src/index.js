import {Context, SupportedNetwork} from "@aragon/sdk-client-common";
import {Wallet} from "@ethersproject/wallet";
import {Client, TokenVotingClient} from "@aragon/sdk-client";
import {createDao} from "./dao.js";
import {createProposal} from "./proposal.js";
import {allotReputationToMembers} from "./reputation.js";
import {createDb} from "./db-manager.js";

export class DaoscordClient {

    constructor(adminPrivateKey, rpcUrl, web3Token) {
        this.adminPrivateKey = adminPrivateKey
        this.rpcUrl = rpcUrl
        this.web3Token = web3Token
    }

    async init(){
        const signer = new Wallet(this.adminPrivateKey);

        const minimalContextParams = {
            network: SupportedNetwork.MUMBAI,
            web3Providers: this.rpcUrl,
            signer: signer,
            ipfsNodes: [
                {
                    url: "https://test.ipfs.aragon.network/api/v0",
                    headers: {
                        "X-API-KEY": "b477RhECf8s8sdM7XrkLBs2wHc4kCMwpbcFC55Kt",
                    },
                }
            ],
        };
        const context = new Context(minimalContextParams);

        this.aragonClient = new Client(context);
        this.aragonTokenVotingClient = new TokenVotingClient(context);

        await createDb(this.web3Token)
    }

    async createDao() {
        return createDao(this.aragonClient, this.adminPrivateKey, this.rpcUrl)
    }

    async createProposal(description, endDate) {
        return createProposal(this.aragonTokenVotingClient, description, endDate)
    }

    async allotReputationToMembers(allocations) {
        return allotReputationToMembers(allocations, this.adminPrivateKey, this.rpcUrl)
    }
}
