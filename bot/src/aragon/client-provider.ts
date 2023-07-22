import {Context, ContextParams, SupportedNetwork} from "@aragon/sdk-client-common";
import {Wallet} from "@ethersproject/wallet";
import {Client, TokenVotingClient} from "@aragon/sdk-client";

const rpcUrl = "https://light-wild-sailboat.matic-testnet.discover.quiknode.pro/c09e966c0a73a4bbe97aa32b765050b617c5933c/"
const signer = new Wallet(process.env.DAOSCORD_PRIVATE_KEY);
const minimalContextParams: ContextParams = {
    network: SupportedNetwork.MUMBAI,
    web3Providers: rpcUrl,
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
const context: Context = new Context(minimalContextParams);

export const client: Client = new Client(context);

export const tokenVotingClient: TokenVotingClient = new TokenVotingClient(context);