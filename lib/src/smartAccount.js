import logger from "./logger.js";
import {ChainId} from "@biconomy/core-types";
import {Bundler} from "@biconomy/bundler";
import {BiconomySmartAccount, DEFAULT_ENTRYPOINT_ADDRESS} from "@biconomy/account";

export const createBiconomySmartAccount = async (wallet) => {
    logger.debug('Create Biconomy smart account...')
    const chain = ChainId.POLYGON_MUMBAI
    const bundler = new Bundler({
        bundlerUrl: 'https://bundler.biconomy.io/api/v2/80001/abc',
        chainId: chain,
        entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS,
    })
    const biconomySmartAccountConfig = {
        signer: wallet,
        chainId: chain,
        bundler: bundler,
    };
    const biconomyAccount = new BiconomySmartAccount(biconomySmartAccountConfig)
    const biconomySmartAccount = await biconomyAccount.init();
    logger.debug('Create Biconomy smart account done.')
    return biconomySmartAccount
}