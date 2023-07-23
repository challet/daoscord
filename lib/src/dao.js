import logger from "./logger.js";
import {DaoCreationSteps, TokenVotingClient, VotingMode} from "@aragon/sdk-client";
import {Wallet} from "@ethersproject/wallet";
import {getDb} from "./db-manager.js";
import {ContractFactory} from "@ethersproject/contracts";
import {JsonRpcProvider} from "@ethersproject/providers";
import {ChainId} from "@biconomy/core-types";
import {
    BiconomySmartAccount, DEFAULT_ENTRYPOINT_ADDRESS,
} from "@biconomy/account";
import {Bundler} from "@biconomy/bundler";

export const createDao = async (aragonClient, adminPrivateKey, rpcUrl) => {
    try {
        logger.debug('Create DAO...')

        const provider = new JsonRpcProvider(rpcUrl)
        const wallet = new Wallet(adminPrivateKey, provider)

        const smartAccount = await createBiconomySmartAccount(wallet)

        const erc20TokenAddress = await deployToken(wallet, smartAccount)

        const db = getDb();

        await deployDao(db, erc20TokenAddress, aragonClient);

        await db.write()
        logger.debug('Create DAO done.')
        return db.data.daoAddress
    } catch (e) {
        console.error(e)
        logger.error(e)
        throw e
    }
}

const deployDao = async (db, erc20TokenAddress, aragonClient) => {
    // const metadata = {
    //     name: "DeFi France",
    //     description: "DAO created with Daoscord",
    //     avatar: "https://img.freepik.com/vecteurs-premium/deesse-demeter_175624-68.jpg?w=826",
    //     links: [{
    //         name: "Github repository",
    //         url: "https://github.com/challet/daoscord",
    //     }],
    // };
    // const metadataUri = await aragonClient.methods.pinMetadata(metadata);
    const metadataUri = 'ipfs://test.test'
    const tokenVotingPluginInstallParams = {
        votingSettings: {
            minDuration: 6000, // seconds
            minParticipation: 0.25, // 25%
            supportThreshold: 0.5, // 50%
            minProposerVotingPower: BigInt("1"), // default 0
            votingMode: VotingMode.EARLY_EXECUTION, // default is STANDARD. other options: EARLY_EXECUTION, VOTE_REPLACEMENT
        },
        useToken: {
            tokenAddress: erc20TokenAddress,
            wrappedToken: {
                name: 'DeFi France',
                symbol: 'DFF'
            }
        }
    };

    const tokenVotingInstallItem = TokenVotingClient.encoding
        .getPluginInstallItem(tokenVotingPluginInstallParams, 'maticmum');

    const createDaoParams = {
        metadataUri,
        ensSubdomain: "defi-france-" + new Date().getTime(),
        plugins: [tokenVotingInstallItem], // plugin array cannot be empty or the transaction will fail. you need at least one governance mechanism to create your DAO.
    };

    logger.debug('Deploying the DAO...')
    const steps = aragonClient.methods.createDao(createDaoParams);
    for await (const step of steps) {
        try {
            switch (step.key) {
                case DaoCreationSteps.CREATING:
                    console.log({txHash: step.txHash});
                    break;
                case DaoCreationSteps.DONE:
                    console.log({
                        daoAddress: step.address,
                        pluginAddresses: step.pluginAddresses,
                    });
                    logger.debug('Deploying the DAO done.')
                    db.data.daoAddress = step.address
                    db.data.tokenVotingPluginAddress = step.pluginAddresses[0]
                    db.data.erc20TokenAddress = erc20TokenAddress
                    break;
            }
        } catch (err) {
            console.error(err);
        }
    }
}

const deployToken = async (wallet, smartAccount) => {
    logger.debug('Deploy token...')
    const contractFactory = ContractFactory.fromSolidity(compilerOutput, wallet)
    const contract = await contractFactory.deploy('DeFi France', 'DFF', { gasLimit: 1 * 10 ** 7 })
    await contract.deployTransaction.wait()
    logger.debug(`Deployed token at ${contract.address}`)

    logger.debug('Change owner...')
    const transaction = await contract.transferOwnership(smartAccount.address);
    await transaction.wait();
    logger.debug('Change owner done.')

    return contract.address
    // const contractFactory = ContractFactory.fromSolidity(compilerOutput, smartAccount.signer)
    // const constructorParams = ['DeFi France', 'DFF']
    // // const gasLimit = await contractFactory.estimateGas.deploy(...constructorParams);
    // const gasPrice = await smartAccount.provider.getGasPrice();
    // const transaction = contractFactory.getDeployTransaction(...constructorParams, {
    //     gasLimit: 2_000_000,
    //     gasPrice: gasPrice,
    //     to: null,
    //     value: 0
    // });
    // const encodedParams = contractFactory.interface.encodeFunctionData('constructor', constructorParams);

    // const txData = compilerOutput.bytecode + encodedParams.slice(2) // Remove '0x' from the encodedParams
    // const gasLimit = await smartAccount.provider.estimateGas({
    //     from: await smartAccount.getAddress(),
    //     data: txData
    // });
    //
    // const gasPrice = await smartAccount.provider.getGasPrice();
    //
    // const transaction = {
    //     gasLimit: gasLimit,
    //     gasPrice: gasPrice,
    //     data: txData
    // };

    // const userOp = await smartAccount.buildUserOp([transaction])
    // userOp.paymasterAndData = "0x"
    //
    // const userOpResponse = await smartAccount.sendUserOp(userOp)
    //
    // const transactionDetail = await userOpResponse.wait()
    // console.log(transactionDetail)

    // logger.debug(`Deployed token at ${contract.address}`)
    // return "contract.address"
}

const createBiconomySmartAccount = async (wallet) => {
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

const compilerOutput = {
    "contractName": "Erc20VotesControlled",
    "abi": [
        {
            "inputs": [
                {
                    "internalType": "string",
                    "name": "name_",
                    "type": "string"
                },
                {
                    "internalType": "string",
                    "name": "symbol_",
                    "type": "string"
                }
            ],
            "stateMutability": "nonpayable",
            "type": "constructor"
        },
        {
            "inputs": [],
            "name": "NotTransferable",
            "type": "error"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "owner",
                    "type": "address"
                },
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "spender",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "value",
                    "type": "uint256"
                }
            ],
            "name": "Approval",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "previousOwner",
                    "type": "address"
                },
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "newOwner",
                    "type": "address"
                }
            ],
            "name": "OwnershipTransferred",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "from",
                    "type": "address"
                },
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "to",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "value",
                    "type": "uint256"
                }
            ],
            "name": "Transfer",
            "type": "event"
        },
        {
            "inputs": [
                {
                    "internalType": "address",
                    "name": "account",
                    "type": "address"
                }
            ],
            "name": "balanceOf",
            "outputs": [
                {
                    "internalType": "uint256",
                    "name": "",
                    "type": "uint256"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "address",
                    "name": "spender",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "subtractedValue",
                    "type": "uint256"
                }
            ],
            "name": "decreaseAllowance",
            "outputs": [
                {
                    "internalType": "bool",
                    "name": "",
                    "type": "bool"
                }
            ],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "address",
                    "name": "spender",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "addedValue",
                    "type": "uint256"
                }
            ],
            "name": "increaseAllowance",
            "outputs": [
                {
                    "internalType": "bool",
                    "name": "",
                    "type": "bool"
                }
            ],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "name",
            "outputs": [
                {
                    "internalType": "string",
                    "name": "",
                    "type": "string"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "owner",
            "outputs": [
                {
                    "internalType": "address",
                    "name": "",
                    "type": "address"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "renounceOwnership",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "symbol",
            "outputs": [
                {
                    "internalType": "string",
                    "name": "",
                    "type": "string"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "totalSupply",
            "outputs": [
                {
                    "internalType": "uint256",
                    "name": "",
                    "type": "uint256"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "address",
                    "name": "newOwner",
                    "type": "address"
                }
            ],
            "name": "transferOwnership",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "decimals",
            "outputs": [
                {
                    "internalType": "uint8",
                    "name": "",
                    "type": "uint8"
                }
            ],
            "stateMutability": "pure",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "address",
                    "name": "",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "",
                    "type": "uint256"
                }
            ],
            "name": "transfer",
            "outputs": [
                {
                    "internalType": "bool",
                    "name": "",
                    "type": "bool"
                }
            ],
            "stateMutability": "pure",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "address",
                    "name": "",
                    "type": "address"
                },
                {
                    "internalType": "address",
                    "name": "",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "",
                    "type": "uint256"
                }
            ],
            "name": "transferFrom",
            "outputs": [
                {
                    "internalType": "bool",
                    "name": "",
                    "type": "bool"
                }
            ],
            "stateMutability": "pure",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "address",
                    "name": "",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "",
                    "type": "uint256"
                }
            ],
            "name": "approve",
            "outputs": [
                {
                    "internalType": "bool",
                    "name": "",
                    "type": "bool"
                }
            ],
            "stateMutability": "pure",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "address",
                    "name": "",
                    "type": "address"
                },
                {
                    "internalType": "address",
                    "name": "spender",
                    "type": "address"
                }
            ],
            "name": "allowance",
            "outputs": [
                {
                    "internalType": "uint256",
                    "name": "",
                    "type": "uint256"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {
                    "internalType": "address",
                    "name": "to",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "newBalance",
                    "type": "uint256"
                }
            ],
            "name": "allot",
            "outputs": [
                {
                    "internalType": "bool",
                    "name": "",
                    "type": "bool"
                }
            ],
            "stateMutability": "nonpayable",
            "type": "function"
        }
    ],
    "metadata": "{\"compiler\":{\"version\":\"0.8.19+commit.7dd6d404\"},\"language\":\"Solidity\",\"output\":{\"abi\":[{\"inputs\":[{\"internalType\":\"string\",\"name\":\"name_\",\"type\":\"string\"},{\"internalType\":\"string\",\"name\":\"symbol_\",\"type\":\"string\"}],\"stateMutability\":\"nonpayable\",\"type\":\"constructor\"},{\"inputs\":[],\"name\":\"NotTransferable\",\"type\":\"error\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"owner\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"spender\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"value\",\"type\":\"uint256\"}],\"name\":\"Approval\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"previousOwner\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"newOwner\",\"type\":\"address\"}],\"name\":\"OwnershipTransferred\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"from\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"to\",\"type\":\"address\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"value\",\"type\":\"uint256\"}],\"name\":\"Transfer\",\"type\":\"event\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"to\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"newBalance\",\"type\":\"uint256\"}],\"name\":\"allot\",\"outputs\":[{\"internalType\":\"bool\",\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"},{\"internalType\":\"address\",\"name\":\"spender\",\"type\":\"address\"}],\"name\":\"allowance\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"name\":\"approve\",\"outputs\":[{\"internalType\":\"bool\",\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"pure\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"account\",\"type\":\"address\"}],\"name\":\"balanceOf\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"decimals\",\"outputs\":[{\"internalType\":\"uint8\",\"name\":\"\",\"type\":\"uint8\"}],\"stateMutability\":\"pure\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"spender\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"subtractedValue\",\"type\":\"uint256\"}],\"name\":\"decreaseAllowance\",\"outputs\":[{\"internalType\":\"bool\",\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"spender\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"addedValue\",\"type\":\"uint256\"}],\"name\":\"increaseAllowance\",\"outputs\":[{\"internalType\":\"bool\",\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"name\",\"outputs\":[{\"internalType\":\"string\",\"name\":\"\",\"type\":\"string\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"owner\",\"outputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"renounceOwnership\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"symbol\",\"outputs\":[{\"internalType\":\"string\",\"name\":\"\",\"type\":\"string\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"totalSupply\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"name\":\"transfer\",\"outputs\":[{\"internalType\":\"bool\",\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"pure\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"},{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"name\":\"transferFrom\",\"outputs\":[{\"internalType\":\"bool\",\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"pure\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"newOwner\",\"type\":\"address\"}],\"name\":\"transferOwnership\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"}],\"devdoc\":{\"events\":{\"Approval(address,address,uint256)\":{\"details\":\"Emitted when the allowance of a `spender` for an `owner` is set by a call to {approve}. `value` is the new allowance.\"},\"Transfer(address,address,uint256)\":{\"details\":\"Emitted when `value` tokens are moved from one account (`from`) to another (`to`). Note that `value` may be zero.\"}},\"kind\":\"dev\",\"methods\":{\"balanceOf(address)\":{\"details\":\"See {IERC20-balanceOf}.\"},\"decimals()\":{\"details\":\"Returns the number of decimals used to get its user representation. For example, if `decimals` equals `2`, a balance of `505` tokens should be displayed to a user as `5.05` (`505 / 10 ** 2`). Tokens usually opt for a value of 18, imitating the relationship between Ether and Wei. This is the default value returned by this function, unless it's overridden. NOTE: This information is only used for _display_ purposes: it in no way affects any of the arithmetic of the contract, including {IERC20-balanceOf} and {IERC20-transfer}.\"},\"decreaseAllowance(address,uint256)\":{\"details\":\"Atomically decreases the allowance granted to `spender` by the caller. This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}. Emits an {Approval} event indicating the updated allowance. Requirements: - `spender` cannot be the zero address. - `spender` must have allowance for the caller of at least `subtractedValue`.\"},\"increaseAllowance(address,uint256)\":{\"details\":\"Atomically increases the allowance granted to `spender` by the caller. This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}. Emits an {Approval} event indicating the updated allowance. Requirements: - `spender` cannot be the zero address.\"},\"name()\":{\"details\":\"Returns the name of the token.\"},\"owner()\":{\"details\":\"Returns the address of the current owner.\"},\"renounceOwnership()\":{\"details\":\"Leaves the contract without owner. It will not be possible to call `onlyOwner` functions. Can only be called by the current owner. NOTE: Renouncing ownership will leave the contract without an owner, thereby disabling any functionality that is only available to the owner.\"},\"symbol()\":{\"details\":\"Returns the symbol of the token, usually a shorter version of the name.\"},\"totalSupply()\":{\"details\":\"See {IERC20-totalSupply}.\"},\"transferOwnership(address)\":{\"details\":\"Transfers ownership of the contract to a new account (`newOwner`). Can only be called by the current owner.\"}},\"version\":1},\"userdoc\":{\"kind\":\"user\",\"methods\":{},\"version\":1}},\"settings\":{\"compilationTarget\":{\"project:/contracts/Erc20VotesControlled.sol\":\"Erc20VotesControlled\"},\"evmVersion\":\"paris\",\"libraries\":{},\"metadata\":{\"bytecodeHash\":\"ipfs\"},\"optimizer\":{\"enabled\":false,\"runs\":200},\"remappings\":[]},\"sources\":{\"@openzeppelin/contracts/access/Ownable.sol\":{\"keccak256\":\"0xba43b97fba0d32eb4254f6a5a297b39a19a247082a02d6e69349e071e2946218\",\"license\":\"MIT\",\"urls\":[\"bzz-raw://fc980984badf3984b6303b377711220e067722bbd6a135b24669ff5069ef9f32\",\"dweb:/ipfs/QmPHXMSXj99XjSVM21YsY6aNtLLjLVXDbyN76J5HQYvvrz\"]},\"@openzeppelin/contracts/token/ERC20/ERC20.sol\":{\"keccak256\":\"0xa56ca923f70c1748830700250b19c61b70db9a683516dc5e216694a50445d99c\",\"license\":\"MIT\",\"urls\":[\"bzz-raw://cac938788bc4be12101e59d45588b4e059579f4e61062e1cda8d6b06c0191b15\",\"dweb:/ipfs/QmV2JKCyjTVH3rkWNrfdJRhAT7tZ3usAN2XcnD4h53Mvih\"]},\"@openzeppelin/contracts/token/ERC20/IERC20.sol\":{\"keccak256\":\"0x287b55befed2961a7eabd7d7b1b2839cbca8a5b80ef8dcbb25ed3d4c2002c305\",\"license\":\"MIT\",\"urls\":[\"bzz-raw://bd39944e8fc06be6dbe2dd1d8449b5336e23c6a7ba3e8e9ae5ae0f37f35283f5\",\"dweb:/ipfs/QmPV3FGYjVwvKSgAXKUN3r9T9GwniZz83CxBpM7vyj2G53\"]},\"@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol\":{\"keccak256\":\"0x8de418a5503946cabe331f35fe242d3201a73f67f77aaeb7110acb1f30423aca\",\"license\":\"MIT\",\"urls\":[\"bzz-raw://5a376d3dda2cb70536c0a45c208b29b34ac560c4cb4f513a42079f96ba47d2dd\",\"dweb:/ipfs/QmZQg6gn1sUpM8wHzwNvSnihumUCAhxD119MpXeKp8B9s8\"]},\"@openzeppelin/contracts/utils/Context.sol\":{\"keccak256\":\"0xe2e337e6dde9ef6b680e07338c493ebea1b5fd09b43424112868e9cc1706bca7\",\"license\":\"MIT\",\"urls\":[\"bzz-raw://6df0ddf21ce9f58271bdfaa85cde98b200ef242a05a3f85c2bc10a8294800a92\",\"dweb:/ipfs/QmRK2Y5Yc6BK7tGKkgsgn3aJEQGi5aakeSPZvS65PV8Xp3\"]},\"project:/contracts/Erc20VotesControlled.sol\":{\"keccak256\":\"0xc8afd821e7001cd1bd65af742acb28499e25b2ed610b6aa01909f09cad31afd5\",\"license\":\"MIT\",\"urls\":[\"bzz-raw://75ebb7dd9fadc302f3c6fb811c98108564f9b7e94ca6c6f2ce6d293e802440b1\",\"dweb:/ipfs/QmRwJArJRySnkverTYvqfAjkHcNWLcqRrG89dXER9uZQvV\"]}},\"version\":1}",
    "bytecode": "0x60806040523480156200001157600080fd5b5060405162001d5838038062001d588339818101604052810190620000379190620002e8565b818181600390816200004a9190620005b8565b5080600490816200005c9190620005b8565b5050506200007f620000736200008760201b60201c565b6200008f60201b60201c565b50506200069f565b600033905090565b6000600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905081600560006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055508173ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a35050565b6000604051905090565b600080fd5b600080fd5b600080fd5b600080fd5b6000601f19601f8301169050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b620001be8262000173565b810181811067ffffffffffffffff82111715620001e057620001df62000184565b5b80604052505050565b6000620001f562000155565b9050620002038282620001b3565b919050565b600067ffffffffffffffff82111562000226576200022562000184565b5b620002318262000173565b9050602081019050919050565b60005b838110156200025e57808201518184015260208101905062000241565b60008484015250505050565b6000620002816200027b8462000208565b620001e9565b905082815260208101848484011115620002a0576200029f6200016e565b5b620002ad8482856200023e565b509392505050565b600082601f830112620002cd57620002cc62000169565b5b8151620002df8482602086016200026a565b91505092915050565b600080604083850312156200030257620003016200015f565b5b600083015167ffffffffffffffff81111562000323576200032262000164565b5b6200033185828601620002b5565b925050602083015167ffffffffffffffff81111562000355576200035462000164565b5b6200036385828601620002b5565b9150509250929050565b600081519050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b60006002820490506001821680620003c057607f821691505b602082108103620003d657620003d562000378565b5b50919050565b60008190508160005260206000209050919050565b60006020601f8301049050919050565b600082821b905092915050565b600060088302620004407fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8262000401565b6200044c868362000401565b95508019841693508086168417925050509392505050565b6000819050919050565b6000819050919050565b600062000499620004936200048d8462000464565b6200046e565b62000464565b9050919050565b6000819050919050565b620004b58362000478565b620004cd620004c482620004a0565b8484546200040e565b825550505050565b600090565b620004e4620004d5565b620004f1818484620004aa565b505050565b5b8181101562000519576200050d600082620004da565b600181019050620004f7565b5050565b601f82111562000568576200053281620003dc565b6200053d84620003f1565b810160208510156200054d578190505b620005656200055c85620003f1565b830182620004f6565b50505b505050565b600082821c905092915050565b60006200058d600019846008026200056d565b1980831691505092915050565b6000620005a883836200057a565b9150826002028217905092915050565b620005c3826200036d565b67ffffffffffffffff811115620005df57620005de62000184565b5b620005eb8254620003a7565b620005f88282856200051d565b600060209050601f8311600181146200063057600084156200061b578287015190505b6200062785826200059a565b86555062000697565b601f1984166200064086620003dc565b60005b828110156200066a5784890151825560018201915060208501945060208101905062000643565b868310156200068a578489015162000686601f8916826200057a565b8355505b6001600288020188555050505b505050505050565b6116a980620006af6000396000f3fe608060405234801561001057600080fd5b50600436106100f55760003560e01c806370a0823111610097578063a457c2d711610066578063a457c2d71461028a578063a9059cbb146102ba578063dd62ed3e146102ea578063f2fde38b1461031a576100f5565b806370a0823114610214578063715018a6146102445780638da5cb5b1461024e57806395d89b411461026c576100f5565b806323b872dd116100d357806323b872dd14610166578063313ce5671461019657806339509351146101b457806340615cf8146101e4576100f5565b806306fdde03146100fa578063095ea7b31461011857806318160ddd14610148575b600080fd5b610102610336565b60405161010f9190610e5b565b60405180910390f35b610132600480360381019061012d9190610f16565b6103c8565b60405161013f9190610f71565b60405180910390f35b6101506103fc565b60405161015d9190610f9b565b60405180910390f35b610180600480360381019061017b9190610fb6565b610406565b60405161018d9190610f71565b60405180910390f35b61019e61043a565b6040516101ab9190611025565b60405180910390f35b6101ce60048036038101906101c99190610f16565b61043f565b6040516101db9190610f71565b60405180910390f35b6101fe60048036038101906101f99190610f16565b610476565b60405161020b9190610f71565b60405180910390f35b61022e60048036038101906102299190611040565b6104d4565b60405161023b9190610f9b565b60405180910390f35b61024c61051c565b005b610256610530565b604051610263919061107c565b60405180910390f35b61027461055a565b6040516102819190610e5b565b60405180910390f35b6102a4600480360381019061029f9190610f16565b6105ec565b6040516102b19190610f71565b60405180910390f35b6102d460048036038101906102cf9190610f16565b610663565b6040516102e19190610f71565b60405180910390f35b61030460048036038101906102ff9190611097565b610697565b6040516103119190610f9b565b60405180910390f35b610334600480360381019061032f9190611040565b610706565b005b60606003805461034590611106565b80601f016020809104026020016040519081016040528092919081815260200182805461037190611106565b80156103be5780601f10610393576101008083540402835291602001916103be565b820191906000526020600020905b8154815290600101906020018083116103a157829003601f168201915b5050505050905090565b60006040517fdc8d8db700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6000600254905090565b60006040517fdc8d8db700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600090565b60008061044a610789565b905061046b81858561045c8589610697565b6104669190611166565b610791565b600191505092915050565b600061048061095a565b600061048b846104d4565b8361049691906111a4565b905060008113156104ac576104ab84826109d8565b5b60008112156104c9576104c884826104c3906111e7565b610b2e565b5b600191505092915050565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b61052461095a565b61052e6000610cfb565b565b6000600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b60606004805461056990611106565b80601f016020809104026020016040519081016040528092919081815260200182805461059590611106565b80156105e25780601f106105b7576101008083540402835291602001916105e2565b820191906000526020600020905b8154815290600101906020018083116105c557829003601f168201915b5050505050905090565b6000806105f7610789565b905060006106058286610697565b90508381101561064a576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610641906112a1565b60405180910390fd5b6106578286868403610791565b60019250505092915050565b60006040517fdc8d8db700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60006106a1610530565b73ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff16036106fb577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9050610700565b600090505b92915050565b61070e61095a565b600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff160361077d576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161077490611333565b60405180910390fd5b61078681610cfb565b50565b600033905090565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff1603610800576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016107f7906113c5565b60405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff160361086f576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161086690611457565b60405180910390fd5b80600160008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9258360405161094d9190610f9b565b60405180910390a3505050565b610962610789565b73ffffffffffffffffffffffffffffffffffffffff16610980610530565b73ffffffffffffffffffffffffffffffffffffffff16146109d6576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016109cd906114c3565b60405180910390fd5b565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff1603610a47576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610a3e9061152f565b60405180910390fd5b610a5360008383610dc1565b8060026000828254610a659190611166565b92505081905550806000808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825401925050819055508173ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef83604051610b169190610f9b565b60405180910390a3610b2a60008383610dc6565b5050565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff1603610b9d576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610b94906115c1565b60405180910390fd5b610ba982600083610dc1565b60008060008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054905081811015610c2f576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610c2690611653565b60405180910390fd5b8181036000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000208190555081600260008282540392505081905550600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef84604051610ce29190610f9b565b60405180910390a3610cf683600084610dc6565b505050565b6000600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905081600560006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055508173ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a35050565b505050565b505050565b600081519050919050565b600082825260208201905092915050565b60005b83811015610e05578082015181840152602081019050610dea565b60008484015250505050565b6000601f19601f8301169050919050565b6000610e2d82610dcb565b610e378185610dd6565b9350610e47818560208601610de7565b610e5081610e11565b840191505092915050565b60006020820190508181036000830152610e758184610e22565b905092915050565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000610ead82610e82565b9050919050565b610ebd81610ea2565b8114610ec857600080fd5b50565b600081359050610eda81610eb4565b92915050565b6000819050919050565b610ef381610ee0565b8114610efe57600080fd5b50565b600081359050610f1081610eea565b92915050565b60008060408385031215610f2d57610f2c610e7d565b5b6000610f3b85828601610ecb565b9250506020610f4c85828601610f01565b9150509250929050565b60008115159050919050565b610f6b81610f56565b82525050565b6000602082019050610f866000830184610f62565b92915050565b610f9581610ee0565b82525050565b6000602082019050610fb06000830184610f8c565b92915050565b600080600060608486031215610fcf57610fce610e7d565b5b6000610fdd86828701610ecb565b9350506020610fee86828701610ecb565b9250506040610fff86828701610f01565b9150509250925092565b600060ff82169050919050565b61101f81611009565b82525050565b600060208201905061103a6000830184611016565b92915050565b60006020828403121561105657611055610e7d565b5b600061106484828501610ecb565b91505092915050565b61107681610ea2565b82525050565b6000602082019050611091600083018461106d565b92915050565b600080604083850312156110ae576110ad610e7d565b5b60006110bc85828601610ecb565b92505060206110cd85828601610ecb565b9150509250929050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b6000600282049050600182168061111e57607f821691505b602082108103611131576111306110d7565b5b50919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b600061117182610ee0565b915061117c83610ee0565b925082820190508082111561119457611193611137565b5b92915050565b6000819050919050565b60006111af8261119a565b91506111ba8361119a565b92508282039050818112600084121682821360008512151617156111e1576111e0611137565b5b92915050565b60006111f28261119a565b91507f8000000000000000000000000000000000000000000000000000000000000000820361122457611223611137565b5b816000039050919050565b7f45524332303a2064656372656173656420616c6c6f77616e63652062656c6f7760008201527f207a65726f000000000000000000000000000000000000000000000000000000602082015250565b600061128b602583610dd6565b91506112968261122f565b604082019050919050565b600060208201905081810360008301526112ba8161127e565b9050919050565b7f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206160008201527f6464726573730000000000000000000000000000000000000000000000000000602082015250565b600061131d602683610dd6565b9150611328826112c1565b604082019050919050565b6000602082019050818103600083015261134c81611310565b9050919050565b7f45524332303a20617070726f76652066726f6d20746865207a65726f2061646460008201527f7265737300000000000000000000000000000000000000000000000000000000602082015250565b60006113af602483610dd6565b91506113ba82611353565b604082019050919050565b600060208201905081810360008301526113de816113a2565b9050919050565b7f45524332303a20617070726f766520746f20746865207a65726f20616464726560008201527f7373000000000000000000000000000000000000000000000000000000000000602082015250565b6000611441602283610dd6565b915061144c826113e5565b604082019050919050565b6000602082019050818103600083015261147081611434565b9050919050565b7f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572600082015250565b60006114ad602083610dd6565b91506114b882611477565b602082019050919050565b600060208201905081810360008301526114dc816114a0565b9050919050565b7f45524332303a206d696e7420746f20746865207a65726f206164647265737300600082015250565b6000611519601f83610dd6565b9150611524826114e3565b602082019050919050565b600060208201905081810360008301526115488161150c565b9050919050565b7f45524332303a206275726e2066726f6d20746865207a65726f2061646472657360008201527f7300000000000000000000000000000000000000000000000000000000000000602082015250565b60006115ab602183610dd6565b91506115b68261154f565b604082019050919050565b600060208201905081810360008301526115da8161159e565b9050919050565b7f45524332303a206275726e20616d6f756e7420657863656564732062616c616e60008201527f6365000000000000000000000000000000000000000000000000000000000000602082015250565b600061163d602283610dd6565b9150611648826115e1565b604082019050919050565b6000602082019050818103600083015261166c81611630565b905091905056fea2646970667358221220ed41104a7b4b5199b2785bb234dc03472b5b0f4921cbe077fe130b82bb25245c64736f6c63430008130033",
    "deployedBytecode": "0x608060405234801561001057600080fd5b50600436106100f55760003560e01c806370a0823111610097578063a457c2d711610066578063a457c2d71461028a578063a9059cbb146102ba578063dd62ed3e146102ea578063f2fde38b1461031a576100f5565b806370a0823114610214578063715018a6146102445780638da5cb5b1461024e57806395d89b411461026c576100f5565b806323b872dd116100d357806323b872dd14610166578063313ce5671461019657806339509351146101b457806340615cf8146101e4576100f5565b806306fdde03146100fa578063095ea7b31461011857806318160ddd14610148575b600080fd5b610102610336565b60405161010f9190610e5b565b60405180910390f35b610132600480360381019061012d9190610f16565b6103c8565b60405161013f9190610f71565b60405180910390f35b6101506103fc565b60405161015d9190610f9b565b60405180910390f35b610180600480360381019061017b9190610fb6565b610406565b60405161018d9190610f71565b60405180910390f35b61019e61043a565b6040516101ab9190611025565b60405180910390f35b6101ce60048036038101906101c99190610f16565b61043f565b6040516101db9190610f71565b60405180910390f35b6101fe60048036038101906101f99190610f16565b610476565b60405161020b9190610f71565b60405180910390f35b61022e60048036038101906102299190611040565b6104d4565b60405161023b9190610f9b565b60405180910390f35b61024c61051c565b005b610256610530565b604051610263919061107c565b60405180910390f35b61027461055a565b6040516102819190610e5b565b60405180910390f35b6102a4600480360381019061029f9190610f16565b6105ec565b6040516102b19190610f71565b60405180910390f35b6102d460048036038101906102cf9190610f16565b610663565b6040516102e19190610f71565b60405180910390f35b61030460048036038101906102ff9190611097565b610697565b6040516103119190610f9b565b60405180910390f35b610334600480360381019061032f9190611040565b610706565b005b60606003805461034590611106565b80601f016020809104026020016040519081016040528092919081815260200182805461037190611106565b80156103be5780601f10610393576101008083540402835291602001916103be565b820191906000526020600020905b8154815290600101906020018083116103a157829003601f168201915b5050505050905090565b60006040517fdc8d8db700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6000600254905090565b60006040517fdc8d8db700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600090565b60008061044a610789565b905061046b81858561045c8589610697565b6104669190611166565b610791565b600191505092915050565b600061048061095a565b600061048b846104d4565b8361049691906111a4565b905060008113156104ac576104ab84826109d8565b5b60008112156104c9576104c884826104c3906111e7565b610b2e565b5b600191505092915050565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b61052461095a565b61052e6000610cfb565b565b6000600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b60606004805461056990611106565b80601f016020809104026020016040519081016040528092919081815260200182805461059590611106565b80156105e25780601f106105b7576101008083540402835291602001916105e2565b820191906000526020600020905b8154815290600101906020018083116105c557829003601f168201915b5050505050905090565b6000806105f7610789565b905060006106058286610697565b90508381101561064a576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610641906112a1565b60405180910390fd5b6106578286868403610791565b60019250505092915050565b60006040517fdc8d8db700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60006106a1610530565b73ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff16036106fb577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9050610700565b600090505b92915050565b61070e61095a565b600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff160361077d576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161077490611333565b60405180910390fd5b61078681610cfb565b50565b600033905090565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff1603610800576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016107f7906113c5565b60405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff160361086f576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161086690611457565b60405180910390fd5b80600160008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9258360405161094d9190610f9b565b60405180910390a3505050565b610962610789565b73ffffffffffffffffffffffffffffffffffffffff16610980610530565b73ffffffffffffffffffffffffffffffffffffffff16146109d6576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016109cd906114c3565b60405180910390fd5b565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff1603610a47576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610a3e9061152f565b60405180910390fd5b610a5360008383610dc1565b8060026000828254610a659190611166565b92505081905550806000808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825401925050819055508173ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef83604051610b169190610f9b565b60405180910390a3610b2a60008383610dc6565b5050565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff1603610b9d576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610b94906115c1565b60405180910390fd5b610ba982600083610dc1565b60008060008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054905081811015610c2f576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610c2690611653565b60405180910390fd5b8181036000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000208190555081600260008282540392505081905550600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef84604051610ce29190610f9b565b60405180910390a3610cf683600084610dc6565b505050565b6000600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905081600560006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055508173ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a35050565b505050565b505050565b600081519050919050565b600082825260208201905092915050565b60005b83811015610e05578082015181840152602081019050610dea565b60008484015250505050565b6000601f19601f8301169050919050565b6000610e2d82610dcb565b610e378185610dd6565b9350610e47818560208601610de7565b610e5081610e11565b840191505092915050565b60006020820190508181036000830152610e758184610e22565b905092915050565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000610ead82610e82565b9050919050565b610ebd81610ea2565b8114610ec857600080fd5b50565b600081359050610eda81610eb4565b92915050565b6000819050919050565b610ef381610ee0565b8114610efe57600080fd5b50565b600081359050610f1081610eea565b92915050565b60008060408385031215610f2d57610f2c610e7d565b5b6000610f3b85828601610ecb565b9250506020610f4c85828601610f01565b9150509250929050565b60008115159050919050565b610f6b81610f56565b82525050565b6000602082019050610f866000830184610f62565b92915050565b610f9581610ee0565b82525050565b6000602082019050610fb06000830184610f8c565b92915050565b600080600060608486031215610fcf57610fce610e7d565b5b6000610fdd86828701610ecb565b9350506020610fee86828701610ecb565b9250506040610fff86828701610f01565b9150509250925092565b600060ff82169050919050565b61101f81611009565b82525050565b600060208201905061103a6000830184611016565b92915050565b60006020828403121561105657611055610e7d565b5b600061106484828501610ecb565b91505092915050565b61107681610ea2565b82525050565b6000602082019050611091600083018461106d565b92915050565b600080604083850312156110ae576110ad610e7d565b5b60006110bc85828601610ecb565b92505060206110cd85828601610ecb565b9150509250929050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b6000600282049050600182168061111e57607f821691505b602082108103611131576111306110d7565b5b50919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b600061117182610ee0565b915061117c83610ee0565b925082820190508082111561119457611193611137565b5b92915050565b6000819050919050565b60006111af8261119a565b91506111ba8361119a565b92508282039050818112600084121682821360008512151617156111e1576111e0611137565b5b92915050565b60006111f28261119a565b91507f8000000000000000000000000000000000000000000000000000000000000000820361122457611223611137565b5b816000039050919050565b7f45524332303a2064656372656173656420616c6c6f77616e63652062656c6f7760008201527f207a65726f000000000000000000000000000000000000000000000000000000602082015250565b600061128b602583610dd6565b91506112968261122f565b604082019050919050565b600060208201905081810360008301526112ba8161127e565b9050919050565b7f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206160008201527f6464726573730000000000000000000000000000000000000000000000000000602082015250565b600061131d602683610dd6565b9150611328826112c1565b604082019050919050565b6000602082019050818103600083015261134c81611310565b9050919050565b7f45524332303a20617070726f76652066726f6d20746865207a65726f2061646460008201527f7265737300000000000000000000000000000000000000000000000000000000602082015250565b60006113af602483610dd6565b91506113ba82611353565b604082019050919050565b600060208201905081810360008301526113de816113a2565b9050919050565b7f45524332303a20617070726f766520746f20746865207a65726f20616464726560008201527f7373000000000000000000000000000000000000000000000000000000000000602082015250565b6000611441602283610dd6565b915061144c826113e5565b604082019050919050565b6000602082019050818103600083015261147081611434565b9050919050565b7f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572600082015250565b60006114ad602083610dd6565b91506114b882611477565b602082019050919050565b600060208201905081810360008301526114dc816114a0565b9050919050565b7f45524332303a206d696e7420746f20746865207a65726f206164647265737300600082015250565b6000611519601f83610dd6565b9150611524826114e3565b602082019050919050565b600060208201905081810360008301526115488161150c565b9050919050565b7f45524332303a206275726e2066726f6d20746865207a65726f2061646472657360008201527f7300000000000000000000000000000000000000000000000000000000000000602082015250565b60006115ab602183610dd6565b91506115b68261154f565b604082019050919050565b600060208201905081810360008301526115da8161159e565b9050919050565b7f45524332303a206275726e20616d6f756e7420657863656564732062616c616e60008201527f6365000000000000000000000000000000000000000000000000000000000000602082015250565b600061163d602283610dd6565b9150611648826115e1565b604082019050919050565b6000602082019050818103600083015261166c81611630565b905091905056fea2646970667358221220ed41104a7b4b5199b2785bb234dc03472b5b0f4921cbe077fe130b82bb25245c64736f6c63430008130033",
    "immutableReferences": {},
    "generatedSources": [
        {
            "ast": {
                "nodeType": "YulBlock",
                "src": "0:8574:6",
                "statements": [
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "47:35:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "57:19:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "73:2:6",
                                                "type": "",
                                                "value": "64"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mload",
                                            "nodeType": "YulIdentifier",
                                            "src": "67:5:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "67:9:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "memPtr",
                                            "nodeType": "YulIdentifier",
                                            "src": "57:6:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "allocate_unbounded",
                        "nodeType": "YulFunctionDefinition",
                        "returnVariables": [
                            {
                                "name": "memPtr",
                                "nodeType": "YulTypedName",
                                "src": "40:6:6",
                                "type": ""
                            }
                        ],
                        "src": "7:75:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "177:28:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "194:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "197:1:6",
                                                "type": "",
                                                "value": "0"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "revert",
                                            "nodeType": "YulIdentifier",
                                            "src": "187:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "187:12:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "187:12:6"
                                }
                            ]
                        },
                        "name": "revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b",
                        "nodeType": "YulFunctionDefinition",
                        "src": "88:117:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "300:28:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "317:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "320:1:6",
                                                "type": "",
                                                "value": "0"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "revert",
                                            "nodeType": "YulIdentifier",
                                            "src": "310:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "310:12:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "310:12:6"
                                }
                            ]
                        },
                        "name": "revert_error_c1322bf8034eace5e0b5c7295db60986aa89aae5e0ea0873e4689e076861a5db",
                        "nodeType": "YulFunctionDefinition",
                        "src": "211:117:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "423:28:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "440:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "443:1:6",
                                                "type": "",
                                                "value": "0"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "revert",
                                            "nodeType": "YulIdentifier",
                                            "src": "433:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "433:12:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "433:12:6"
                                }
                            ]
                        },
                        "name": "revert_error_1b9f4a0a5773e33b91aa01db23bf8c55fce1411167c872835e7fa00a4f17d46d",
                        "nodeType": "YulFunctionDefinition",
                        "src": "334:117:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "546:28:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "563:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "566:1:6",
                                                "type": "",
                                                "value": "0"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "revert",
                                            "nodeType": "YulIdentifier",
                                            "src": "556:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "556:12:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "556:12:6"
                                }
                            ]
                        },
                        "name": "revert_error_987264b3b1d58a9c7f8255e93e81c77d86d6299019c33110a076957a3e06e2ae",
                        "nodeType": "YulFunctionDefinition",
                        "src": "457:117:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "628:54:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "638:38:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "value",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "656:5:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "663:2:6",
                                                        "type": "",
                                                        "value": "31"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "652:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "652:14:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "672:2:6",
                                                        "type": "",
                                                        "value": "31"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "not",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "668:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "668:7:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "and",
                                            "nodeType": "YulIdentifier",
                                            "src": "648:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "648:28:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "result",
                                            "nodeType": "YulIdentifier",
                                            "src": "638:6:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "round_up_to_mul_of_32",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "611:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "result",
                                "nodeType": "YulTypedName",
                                "src": "621:6:6",
                                "type": ""
                            }
                        ],
                        "src": "580:102:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "716:152:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "733:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "736:77:6",
                                                "type": "",
                                                "value": "35408467139433450592217433187231851964531694900788300625387963629091585785856"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "726:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "726:88:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "726:88:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "830:1:6",
                                                "type": "",
                                                "value": "4"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "833:4:6",
                                                "type": "",
                                                "value": "0x41"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "823:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "823:15:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "823:15:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "854:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "857:4:6",
                                                "type": "",
                                                "value": "0x24"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "revert",
                                            "nodeType": "YulIdentifier",
                                            "src": "847:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "847:15:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "847:15:6"
                                }
                            ]
                        },
                        "name": "panic_error_0x41",
                        "nodeType": "YulFunctionDefinition",
                        "src": "688:180:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "917:238:6",
                            "statements": [
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "927:58:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "memPtr",
                                                "nodeType": "YulIdentifier",
                                                "src": "949:6:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "size",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "979:4:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "round_up_to_mul_of_32",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "957:21:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "957:27:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "945:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "945:40:6"
                                    },
                                    "variables": [
                                        {
                                            "name": "newFreePtr",
                                            "nodeType": "YulTypedName",
                                            "src": "931:10:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "1096:22:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "panic_error_0x41",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1098:16:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "1098:18:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "1098:18:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "newFreePtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1039:10:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "1051:18:6",
                                                        "type": "",
                                                        "value": "0xffffffffffffffff"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "gt",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "1036:2:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "1036:34:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "newFreePtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1075:10:6"
                                                    },
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1087:6:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "lt",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "1072:2:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "1072:22:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "or",
                                            "nodeType": "YulIdentifier",
                                            "src": "1033:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1033:62:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "1030:88:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "1134:2:6",
                                                "type": "",
                                                "value": "64"
                                            },
                                            {
                                                "name": "newFreePtr",
                                                "nodeType": "YulIdentifier",
                                                "src": "1138:10:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "1127:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1127:22:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "1127:22:6"
                                }
                            ]
                        },
                        "name": "finalize_allocation",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "memPtr",
                                "nodeType": "YulTypedName",
                                "src": "903:6:6",
                                "type": ""
                            },
                            {
                                "name": "size",
                                "nodeType": "YulTypedName",
                                "src": "911:4:6",
                                "type": ""
                            }
                        ],
                        "src": "874:281:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "1202:88:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "1212:30:6",
                                    "value": {
                                        "arguments": [],
                                        "functionName": {
                                            "name": "allocate_unbounded",
                                            "nodeType": "YulIdentifier",
                                            "src": "1222:18:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1222:20:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "memPtr",
                                            "nodeType": "YulIdentifier",
                                            "src": "1212:6:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "memPtr",
                                                "nodeType": "YulIdentifier",
                                                "src": "1271:6:6"
                                            },
                                            {
                                                "name": "size",
                                                "nodeType": "YulIdentifier",
                                                "src": "1279:4:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "finalize_allocation",
                                            "nodeType": "YulIdentifier",
                                            "src": "1251:19:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1251:33:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "1251:33:6"
                                }
                            ]
                        },
                        "name": "allocate_memory",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "size",
                                "nodeType": "YulTypedName",
                                "src": "1186:4:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "memPtr",
                                "nodeType": "YulTypedName",
                                "src": "1195:6:6",
                                "type": ""
                            }
                        ],
                        "src": "1161:129:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "1363:241:6",
                            "statements": [
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "1468:22:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "panic_error_0x41",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1470:16:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "1470:18:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "1470:18:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "name": "length",
                                                "nodeType": "YulIdentifier",
                                                "src": "1440:6:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "1448:18:6",
                                                "type": "",
                                                "value": "0xffffffffffffffff"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "gt",
                                            "nodeType": "YulIdentifier",
                                            "src": "1437:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1437:30:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "1434:56:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "1500:37:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "length",
                                                "nodeType": "YulIdentifier",
                                                "src": "1530:6:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "round_up_to_mul_of_32",
                                            "nodeType": "YulIdentifier",
                                            "src": "1508:21:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1508:29:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "size",
                                            "nodeType": "YulIdentifier",
                                            "src": "1500:4:6"
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "1574:23:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "size",
                                                "nodeType": "YulIdentifier",
                                                "src": "1586:4:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "1592:4:6",
                                                "type": "",
                                                "value": "0x20"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "1582:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1582:15:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "size",
                                            "nodeType": "YulIdentifier",
                                            "src": "1574:4:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "array_allocation_size_t_string_memory_ptr",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "length",
                                "nodeType": "YulTypedName",
                                "src": "1347:6:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "size",
                                "nodeType": "YulTypedName",
                                "src": "1358:4:6",
                                "type": ""
                            }
                        ],
                        "src": "1296:308:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "1672:184:6",
                            "statements": [
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "1682:10:6",
                                    "value": {
                                        "kind": "number",
                                        "nodeType": "YulLiteral",
                                        "src": "1691:1:6",
                                        "type": "",
                                        "value": "0"
                                    },
                                    "variables": [
                                        {
                                            "name": "i",
                                            "nodeType": "YulTypedName",
                                            "src": "1686:1:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "1751:63:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [
                                                        {
                                                            "arguments": [
                                                                {
                                                                    "name": "dst",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "1776:3:6"
                                                                },
                                                                {
                                                                    "name": "i",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "1781:1:6"
                                                                }
                                                            ],
                                                            "functionName": {
                                                                "name": "add",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "1772:3:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "1772:11:6"
                                                        },
                                                        {
                                                            "arguments": [
                                                                {
                                                                    "arguments": [
                                                                        {
                                                                            "name": "src",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "1795:3:6"
                                                                        },
                                                                        {
                                                                            "name": "i",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "1800:1:6"
                                                                        }
                                                                    ],
                                                                    "functionName": {
                                                                        "name": "add",
                                                                        "nodeType": "YulIdentifier",
                                                                        "src": "1791:3:6"
                                                                    },
                                                                    "nodeType": "YulFunctionCall",
                                                                    "src": "1791:11:6"
                                                                }
                                                            ],
                                                            "functionName": {
                                                                "name": "mload",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "1785:5:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "1785:18:6"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "mstore",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1765:6:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "1765:39:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "1765:39:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "name": "i",
                                                "nodeType": "YulIdentifier",
                                                "src": "1712:1:6"
                                            },
                                            {
                                                "name": "length",
                                                "nodeType": "YulIdentifier",
                                                "src": "1715:6:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "lt",
                                            "nodeType": "YulIdentifier",
                                            "src": "1709:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1709:13:6"
                                    },
                                    "nodeType": "YulForLoop",
                                    "post": {
                                        "nodeType": "YulBlock",
                                        "src": "1723:19:6",
                                        "statements": [
                                            {
                                                "nodeType": "YulAssignment",
                                                "src": "1725:15:6",
                                                "value": {
                                                    "arguments": [
                                                        {
                                                            "name": "i",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "1734:1:6"
                                                        },
                                                        {
                                                            "kind": "number",
                                                            "nodeType": "YulLiteral",
                                                            "src": "1737:2:6",
                                                            "type": "",
                                                            "value": "32"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "add",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1730:3:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "1730:10:6"
                                                },
                                                "variableNames": [
                                                    {
                                                        "name": "i",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1725:1:6"
                                                    }
                                                ]
                                            }
                                        ]
                                    },
                                    "pre": {
                                        "nodeType": "YulBlock",
                                        "src": "1705:3:6",
                                        "statements": []
                                    },
                                    "src": "1701:113:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "dst",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1834:3:6"
                                                    },
                                                    {
                                                        "name": "length",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1839:6:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "1830:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "1830:16:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "1848:1:6",
                                                "type": "",
                                                "value": "0"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "1823:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1823:27:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "1823:27:6"
                                }
                            ]
                        },
                        "name": "copy_memory_to_memory_with_cleanup",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "src",
                                "nodeType": "YulTypedName",
                                "src": "1654:3:6",
                                "type": ""
                            },
                            {
                                "name": "dst",
                                "nodeType": "YulTypedName",
                                "src": "1659:3:6",
                                "type": ""
                            },
                            {
                                "name": "length",
                                "nodeType": "YulTypedName",
                                "src": "1664:6:6",
                                "type": ""
                            }
                        ],
                        "src": "1610:246:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "1957:339:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "1967:75:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "length",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2034:6:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "array_allocation_size_t_string_memory_ptr",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "1992:41:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "1992:49:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "allocate_memory",
                                            "nodeType": "YulIdentifier",
                                            "src": "1976:15:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1976:66:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "array",
                                            "nodeType": "YulIdentifier",
                                            "src": "1967:5:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "array",
                                                "nodeType": "YulIdentifier",
                                                "src": "2058:5:6"
                                            },
                                            {
                                                "name": "length",
                                                "nodeType": "YulIdentifier",
                                                "src": "2065:6:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "2051:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2051:21:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "2051:21:6"
                                },
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "2081:27:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "array",
                                                "nodeType": "YulIdentifier",
                                                "src": "2096:5:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "2103:4:6",
                                                "type": "",
                                                "value": "0x20"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "2092:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2092:16:6"
                                    },
                                    "variables": [
                                        {
                                            "name": "dst",
                                            "nodeType": "YulTypedName",
                                            "src": "2085:3:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "2146:83:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "revert_error_987264b3b1d58a9c7f8255e93e81c77d86d6299019c33110a076957a3e06e2ae",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2148:77:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "2148:79:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "2148:79:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "src",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2127:3:6"
                                                    },
                                                    {
                                                        "name": "length",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2132:6:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "2123:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "2123:16:6"
                                            },
                                            {
                                                "name": "end",
                                                "nodeType": "YulIdentifier",
                                                "src": "2141:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "gt",
                                            "nodeType": "YulIdentifier",
                                            "src": "2120:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2120:25:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "2117:112:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "src",
                                                "nodeType": "YulIdentifier",
                                                "src": "2273:3:6"
                                            },
                                            {
                                                "name": "dst",
                                                "nodeType": "YulIdentifier",
                                                "src": "2278:3:6"
                                            },
                                            {
                                                "name": "length",
                                                "nodeType": "YulIdentifier",
                                                "src": "2283:6:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "copy_memory_to_memory_with_cleanup",
                                            "nodeType": "YulIdentifier",
                                            "src": "2238:34:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2238:52:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "2238:52:6"
                                }
                            ]
                        },
                        "name": "abi_decode_available_length_t_string_memory_ptr_fromMemory",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "src",
                                "nodeType": "YulTypedName",
                                "src": "1930:3:6",
                                "type": ""
                            },
                            {
                                "name": "length",
                                "nodeType": "YulTypedName",
                                "src": "1935:6:6",
                                "type": ""
                            },
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "1943:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "array",
                                "nodeType": "YulTypedName",
                                "src": "1951:5:6",
                                "type": ""
                            }
                        ],
                        "src": "1862:434:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "2389:282:6",
                            "statements": [
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "2438:83:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "revert_error_1b9f4a0a5773e33b91aa01db23bf8c55fce1411167c872835e7fa00a4f17d46d",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2440:77:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "2440:79:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "2440:79:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "offset",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "2417:6:6"
                                                            },
                                                            {
                                                                "kind": "number",
                                                                "nodeType": "YulLiteral",
                                                                "src": "2425:4:6",
                                                                "type": "",
                                                                "value": "0x1f"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "add",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "2413:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "2413:17:6"
                                                    },
                                                    {
                                                        "name": "end",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2432:3:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "slt",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "2409:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "2409:27:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "iszero",
                                            "nodeType": "YulIdentifier",
                                            "src": "2402:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2402:35:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "2399:122:6"
                                },
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "2530:27:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "offset",
                                                "nodeType": "YulIdentifier",
                                                "src": "2550:6:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mload",
                                            "nodeType": "YulIdentifier",
                                            "src": "2544:5:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2544:13:6"
                                    },
                                    "variables": [
                                        {
                                            "name": "length",
                                            "nodeType": "YulTypedName",
                                            "src": "2534:6:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "2566:99:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "offset",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2638:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "2646:4:6",
                                                        "type": "",
                                                        "value": "0x20"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "2634:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "2634:17:6"
                                            },
                                            {
                                                "name": "length",
                                                "nodeType": "YulIdentifier",
                                                "src": "2653:6:6"
                                            },
                                            {
                                                "name": "end",
                                                "nodeType": "YulIdentifier",
                                                "src": "2661:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_decode_available_length_t_string_memory_ptr_fromMemory",
                                            "nodeType": "YulIdentifier",
                                            "src": "2575:58:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2575:90:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "array",
                                            "nodeType": "YulIdentifier",
                                            "src": "2566:5:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_decode_t_string_memory_ptr_fromMemory",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "offset",
                                "nodeType": "YulTypedName",
                                "src": "2367:6:6",
                                "type": ""
                            },
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "2375:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "array",
                                "nodeType": "YulTypedName",
                                "src": "2383:5:6",
                                "type": ""
                            }
                        ],
                        "src": "2316:355:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "2791:739:6",
                            "statements": [
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "2837:83:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2839:77:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "2839:79:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "2839:79:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2812:7:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2821:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "2808:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "2808:23:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "2833:2:6",
                                                "type": "",
                                                "value": "64"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "slt",
                                            "nodeType": "YulIdentifier",
                                            "src": "2804:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2804:32:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "2801:119:6"
                                },
                                {
                                    "nodeType": "YulBlock",
                                    "src": "2930:291:6",
                                    "statements": [
                                        {
                                            "nodeType": "YulVariableDeclaration",
                                            "src": "2945:38:6",
                                            "value": {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "headStart",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "2969:9:6"
                                                            },
                                                            {
                                                                "kind": "number",
                                                                "nodeType": "YulLiteral",
                                                                "src": "2980:1:6",
                                                                "type": "",
                                                                "value": "0"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "add",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "2965:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "2965:17:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "mload",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "2959:5:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "2959:24:6"
                                            },
                                            "variables": [
                                                {
                                                    "name": "offset",
                                                    "nodeType": "YulTypedName",
                                                    "src": "2949:6:6",
                                                    "type": ""
                                                }
                                            ]
                                        },
                                        {
                                            "body": {
                                                "nodeType": "YulBlock",
                                                "src": "3030:83:6",
                                                "statements": [
                                                    {
                                                        "expression": {
                                                            "arguments": [],
                                                            "functionName": {
                                                                "name": "revert_error_c1322bf8034eace5e0b5c7295db60986aa89aae5e0ea0873e4689e076861a5db",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "3032:77:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "3032:79:6"
                                                        },
                                                        "nodeType": "YulExpressionStatement",
                                                        "src": "3032:79:6"
                                                    }
                                                ]
                                            },
                                            "condition": {
                                                "arguments": [
                                                    {
                                                        "name": "offset",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "3002:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "3010:18:6",
                                                        "type": "",
                                                        "value": "0xffffffffffffffff"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "gt",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "2999:2:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "2999:30:6"
                                            },
                                            "nodeType": "YulIf",
                                            "src": "2996:117:6"
                                        },
                                        {
                                            "nodeType": "YulAssignment",
                                            "src": "3127:84:6",
                                            "value": {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "headStart",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "3183:9:6"
                                                            },
                                                            {
                                                                "name": "offset",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "3194:6:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "add",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "3179:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "3179:22:6"
                                                    },
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "3203:7:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "abi_decode_t_string_memory_ptr_fromMemory",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "3137:41:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "3137:74:6"
                                            },
                                            "variableNames": [
                                                {
                                                    "name": "value0",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "3127:6:6"
                                                }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulBlock",
                                    "src": "3231:292:6",
                                    "statements": [
                                        {
                                            "nodeType": "YulVariableDeclaration",
                                            "src": "3246:39:6",
                                            "value": {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "headStart",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "3270:9:6"
                                                            },
                                                            {
                                                                "kind": "number",
                                                                "nodeType": "YulLiteral",
                                                                "src": "3281:2:6",
                                                                "type": "",
                                                                "value": "32"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "add",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "3266:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "3266:18:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "mload",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "3260:5:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "3260:25:6"
                                            },
                                            "variables": [
                                                {
                                                    "name": "offset",
                                                    "nodeType": "YulTypedName",
                                                    "src": "3250:6:6",
                                                    "type": ""
                                                }
                                            ]
                                        },
                                        {
                                            "body": {
                                                "nodeType": "YulBlock",
                                                "src": "3332:83:6",
                                                "statements": [
                                                    {
                                                        "expression": {
                                                            "arguments": [],
                                                            "functionName": {
                                                                "name": "revert_error_c1322bf8034eace5e0b5c7295db60986aa89aae5e0ea0873e4689e076861a5db",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "3334:77:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "3334:79:6"
                                                        },
                                                        "nodeType": "YulExpressionStatement",
                                                        "src": "3334:79:6"
                                                    }
                                                ]
                                            },
                                            "condition": {
                                                "arguments": [
                                                    {
                                                        "name": "offset",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "3304:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "3312:18:6",
                                                        "type": "",
                                                        "value": "0xffffffffffffffff"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "gt",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "3301:2:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "3301:30:6"
                                            },
                                            "nodeType": "YulIf",
                                            "src": "3298:117:6"
                                        },
                                        {
                                            "nodeType": "YulAssignment",
                                            "src": "3429:84:6",
                                            "value": {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "headStart",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "3485:9:6"
                                                            },
                                                            {
                                                                "name": "offset",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "3496:6:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "add",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "3481:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "3481:22:6"
                                                    },
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "3505:7:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "abi_decode_t_string_memory_ptr_fromMemory",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "3439:41:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "3439:74:6"
                                            },
                                            "variableNames": [
                                                {
                                                    "name": "value1",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "3429:6:6"
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_decode_tuple_t_string_memory_ptrt_string_memory_ptr_fromMemory",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "2753:9:6",
                                "type": ""
                            },
                            {
                                "name": "dataEnd",
                                "nodeType": "YulTypedName",
                                "src": "2764:7:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "value0",
                                "nodeType": "YulTypedName",
                                "src": "2776:6:6",
                                "type": ""
                            },
                            {
                                "name": "value1",
                                "nodeType": "YulTypedName",
                                "src": "2784:6:6",
                                "type": ""
                            }
                        ],
                        "src": "2677:853:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "3595:40:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "3606:22:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "3622:5:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mload",
                                            "nodeType": "YulIdentifier",
                                            "src": "3616:5:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3616:12:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "length",
                                            "nodeType": "YulIdentifier",
                                            "src": "3606:6:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "array_length_t_string_memory_ptr",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "3578:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "length",
                                "nodeType": "YulTypedName",
                                "src": "3588:6:6",
                                "type": ""
                            }
                        ],
                        "src": "3536:99:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "3669:152:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "3686:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "3689:77:6",
                                                "type": "",
                                                "value": "35408467139433450592217433187231851964531694900788300625387963629091585785856"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "3679:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3679:88:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "3679:88:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "3783:1:6",
                                                "type": "",
                                                "value": "4"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "3786:4:6",
                                                "type": "",
                                                "value": "0x22"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "3776:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3776:15:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "3776:15:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "3807:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "3810:4:6",
                                                "type": "",
                                                "value": "0x24"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "revert",
                                            "nodeType": "YulIdentifier",
                                            "src": "3800:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3800:15:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "3800:15:6"
                                }
                            ]
                        },
                        "name": "panic_error_0x22",
                        "nodeType": "YulFunctionDefinition",
                        "src": "3641:180:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "3878:269:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "3888:22:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "data",
                                                "nodeType": "YulIdentifier",
                                                "src": "3902:4:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "3908:1:6",
                                                "type": "",
                                                "value": "2"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "div",
                                            "nodeType": "YulIdentifier",
                                            "src": "3898:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3898:12:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "length",
                                            "nodeType": "YulIdentifier",
                                            "src": "3888:6:6"
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "3919:38:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "data",
                                                "nodeType": "YulIdentifier",
                                                "src": "3949:4:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "3955:1:6",
                                                "type": "",
                                                "value": "1"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "and",
                                            "nodeType": "YulIdentifier",
                                            "src": "3945:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3945:12:6"
                                    },
                                    "variables": [
                                        {
                                            "name": "outOfPlaceEncoding",
                                            "nodeType": "YulTypedName",
                                            "src": "3923:18:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "3996:51:6",
                                        "statements": [
                                            {
                                                "nodeType": "YulAssignment",
                                                "src": "4010:27:6",
                                                "value": {
                                                    "arguments": [
                                                        {
                                                            "name": "length",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "4024:6:6"
                                                        },
                                                        {
                                                            "kind": "number",
                                                            "nodeType": "YulLiteral",
                                                            "src": "4032:4:6",
                                                            "type": "",
                                                            "value": "0x7f"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "and",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4020:3:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "4020:17:6"
                                                },
                                                "variableNames": [
                                                    {
                                                        "name": "length",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4010:6:6"
                                                    }
                                                ]
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "name": "outOfPlaceEncoding",
                                                "nodeType": "YulIdentifier",
                                                "src": "3976:18:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "iszero",
                                            "nodeType": "YulIdentifier",
                                            "src": "3969:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3969:26:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "3966:81:6"
                                },
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "4099:42:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "panic_error_0x22",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4113:16:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "4113:18:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "4113:18:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "name": "outOfPlaceEncoding",
                                                "nodeType": "YulIdentifier",
                                                "src": "4063:18:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "length",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4086:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "4094:2:6",
                                                        "type": "",
                                                        "value": "32"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "lt",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "4083:2:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "4083:14:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "eq",
                                            "nodeType": "YulIdentifier",
                                            "src": "4060:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4060:38:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "4057:84:6"
                                }
                            ]
                        },
                        "name": "extract_byte_array_length",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "data",
                                "nodeType": "YulTypedName",
                                "src": "3862:4:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "length",
                                "nodeType": "YulTypedName",
                                "src": "3871:6:6",
                                "type": ""
                            }
                        ],
                        "src": "3827:320:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "4207:87:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "4217:11:6",
                                    "value": {
                                        "name": "ptr",
                                        "nodeType": "YulIdentifier",
                                        "src": "4225:3:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "data",
                                            "nodeType": "YulIdentifier",
                                            "src": "4217:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "4245:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "name": "ptr",
                                                "nodeType": "YulIdentifier",
                                                "src": "4248:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "4238:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4238:14:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "4238:14:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "4261:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "4279:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "4282:4:6",
                                                "type": "",
                                                "value": "0x20"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "keccak256",
                                            "nodeType": "YulIdentifier",
                                            "src": "4269:9:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4269:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "data",
                                            "nodeType": "YulIdentifier",
                                            "src": "4261:4:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "array_dataslot_t_string_storage",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "ptr",
                                "nodeType": "YulTypedName",
                                "src": "4194:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "data",
                                "nodeType": "YulTypedName",
                                "src": "4202:4:6",
                                "type": ""
                            }
                        ],
                        "src": "4153:141:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "4344:49:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "4354:33:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "value",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4372:5:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "4379:2:6",
                                                        "type": "",
                                                        "value": "31"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "4368:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "4368:14:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "4384:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "div",
                                            "nodeType": "YulIdentifier",
                                            "src": "4364:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4364:23:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "result",
                                            "nodeType": "YulIdentifier",
                                            "src": "4354:6:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "divide_by_32_ceil",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "4327:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "result",
                                "nodeType": "YulTypedName",
                                "src": "4337:6:6",
                                "type": ""
                            }
                        ],
                        "src": "4300:93:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "4452:54:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "4462:37:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "bits",
                                                "nodeType": "YulIdentifier",
                                                "src": "4487:4:6"
                                            },
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "4493:5:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "shl",
                                            "nodeType": "YulIdentifier",
                                            "src": "4483:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4483:16:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "newValue",
                                            "nodeType": "YulIdentifier",
                                            "src": "4462:8:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "shift_left_dynamic",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "bits",
                                "nodeType": "YulTypedName",
                                "src": "4427:4:6",
                                "type": ""
                            },
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "4433:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "newValue",
                                "nodeType": "YulTypedName",
                                "src": "4443:8:6",
                                "type": ""
                            }
                        ],
                        "src": "4399:107:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "4588:317:6",
                            "statements": [
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "4598:35:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "shiftBytes",
                                                "nodeType": "YulIdentifier",
                                                "src": "4619:10:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "4631:1:6",
                                                "type": "",
                                                "value": "8"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mul",
                                            "nodeType": "YulIdentifier",
                                            "src": "4615:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4615:18:6"
                                    },
                                    "variables": [
                                        {
                                            "name": "shiftBits",
                                            "nodeType": "YulTypedName",
                                            "src": "4602:9:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "4642:109:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "shiftBits",
                                                "nodeType": "YulIdentifier",
                                                "src": "4673:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "4684:66:6",
                                                "type": "",
                                                "value": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "shift_left_dynamic",
                                            "nodeType": "YulIdentifier",
                                            "src": "4654:18:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4654:97:6"
                                    },
                                    "variables": [
                                        {
                                            "name": "mask",
                                            "nodeType": "YulTypedName",
                                            "src": "4646:4:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "4760:51:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "shiftBits",
                                                "nodeType": "YulIdentifier",
                                                "src": "4791:9:6"
                                            },
                                            {
                                                "name": "toInsert",
                                                "nodeType": "YulIdentifier",
                                                "src": "4802:8:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "shift_left_dynamic",
                                            "nodeType": "YulIdentifier",
                                            "src": "4772:18:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4772:39:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "toInsert",
                                            "nodeType": "YulIdentifier",
                                            "src": "4760:8:6"
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "4820:30:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "4833:5:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "mask",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4844:4:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "not",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "4840:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "4840:9:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "and",
                                            "nodeType": "YulIdentifier",
                                            "src": "4829:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4829:21:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "value",
                                            "nodeType": "YulIdentifier",
                                            "src": "4820:5:6"
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "4859:40:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "4872:5:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "toInsert",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4883:8:6"
                                                    },
                                                    {
                                                        "name": "mask",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4893:4:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "and",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "4879:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "4879:19:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "or",
                                            "nodeType": "YulIdentifier",
                                            "src": "4869:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4869:30:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "result",
                                            "nodeType": "YulIdentifier",
                                            "src": "4859:6:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "update_byte_slice_dynamic32",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "4549:5:6",
                                "type": ""
                            },
                            {
                                "name": "shiftBytes",
                                "nodeType": "YulTypedName",
                                "src": "4556:10:6",
                                "type": ""
                            },
                            {
                                "name": "toInsert",
                                "nodeType": "YulTypedName",
                                "src": "4568:8:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "result",
                                "nodeType": "YulTypedName",
                                "src": "4581:6:6",
                                "type": ""
                            }
                        ],
                        "src": "4512:393:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "4956:32:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "4966:16:6",
                                    "value": {
                                        "name": "value",
                                        "nodeType": "YulIdentifier",
                                        "src": "4977:5:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "cleaned",
                                            "nodeType": "YulIdentifier",
                                            "src": "4966:7:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "cleanup_t_uint256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "4938:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "cleaned",
                                "nodeType": "YulTypedName",
                                "src": "4948:7:6",
                                "type": ""
                            }
                        ],
                        "src": "4911:77:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "5026:28:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "5036:12:6",
                                    "value": {
                                        "name": "value",
                                        "nodeType": "YulIdentifier",
                                        "src": "5043:5:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "ret",
                                            "nodeType": "YulIdentifier",
                                            "src": "5036:3:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "identity",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "5012:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "ret",
                                "nodeType": "YulTypedName",
                                "src": "5022:3:6",
                                "type": ""
                            }
                        ],
                        "src": "4994:60:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "5120:82:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "5130:66:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "value",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "5188:5:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "cleanup_t_uint256",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "5170:17:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "5170:24:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "identity",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "5161:8:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "5161:34:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "cleanup_t_uint256",
                                            "nodeType": "YulIdentifier",
                                            "src": "5143:17:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "5143:53:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "converted",
                                            "nodeType": "YulIdentifier",
                                            "src": "5130:9:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "convert_t_uint256_to_t_uint256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "5100:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "converted",
                                "nodeType": "YulTypedName",
                                "src": "5110:9:6",
                                "type": ""
                            }
                        ],
                        "src": "5060:142:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "5255:28:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "5265:12:6",
                                    "value": {
                                        "name": "value",
                                        "nodeType": "YulIdentifier",
                                        "src": "5272:5:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "ret",
                                            "nodeType": "YulIdentifier",
                                            "src": "5265:3:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "prepare_store_t_uint256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "5241:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "ret",
                                "nodeType": "YulTypedName",
                                "src": "5251:3:6",
                                "type": ""
                            }
                        ],
                        "src": "5208:75:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "5365:193:6",
                            "statements": [
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "5375:63:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "value_0",
                                                "nodeType": "YulIdentifier",
                                                "src": "5430:7:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "convert_t_uint256_to_t_uint256",
                                            "nodeType": "YulIdentifier",
                                            "src": "5399:30:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "5399:39:6"
                                    },
                                    "variables": [
                                        {
                                            "name": "convertedValue_0",
                                            "nodeType": "YulTypedName",
                                            "src": "5379:16:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "slot",
                                                "nodeType": "YulIdentifier",
                                                "src": "5454:4:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "slot",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "5494:4:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "sload",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "5488:5:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "5488:11:6"
                                                    },
                                                    {
                                                        "name": "offset",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "5501:6:6"
                                                    },
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "convertedValue_0",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "5533:16:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "prepare_store_t_uint256",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "5509:23:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "5509:41:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "update_byte_slice_dynamic32",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "5460:27:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "5460:91:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "sstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "5447:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "5447:105:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "5447:105:6"
                                }
                            ]
                        },
                        "name": "update_storage_value_t_uint256_to_t_uint256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "slot",
                                "nodeType": "YulTypedName",
                                "src": "5342:4:6",
                                "type": ""
                            },
                            {
                                "name": "offset",
                                "nodeType": "YulTypedName",
                                "src": "5348:6:6",
                                "type": ""
                            },
                            {
                                "name": "value_0",
                                "nodeType": "YulTypedName",
                                "src": "5356:7:6",
                                "type": ""
                            }
                        ],
                        "src": "5289:269:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "5613:24:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "5623:8:6",
                                    "value": {
                                        "kind": "number",
                                        "nodeType": "YulLiteral",
                                        "src": "5630:1:6",
                                        "type": "",
                                        "value": "0"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "ret",
                                            "nodeType": "YulIdentifier",
                                            "src": "5623:3:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "zero_value_for_split_t_uint256",
                        "nodeType": "YulFunctionDefinition",
                        "returnVariables": [
                            {
                                "name": "ret",
                                "nodeType": "YulTypedName",
                                "src": "5609:3:6",
                                "type": ""
                            }
                        ],
                        "src": "5564:73:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "5696:136:6",
                            "statements": [
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "5706:46:6",
                                    "value": {
                                        "arguments": [],
                                        "functionName": {
                                            "name": "zero_value_for_split_t_uint256",
                                            "nodeType": "YulIdentifier",
                                            "src": "5720:30:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "5720:32:6"
                                    },
                                    "variables": [
                                        {
                                            "name": "zero_0",
                                            "nodeType": "YulTypedName",
                                            "src": "5710:6:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "slot",
                                                "nodeType": "YulIdentifier",
                                                "src": "5805:4:6"
                                            },
                                            {
                                                "name": "offset",
                                                "nodeType": "YulIdentifier",
                                                "src": "5811:6:6"
                                            },
                                            {
                                                "name": "zero_0",
                                                "nodeType": "YulIdentifier",
                                                "src": "5819:6:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "update_storage_value_t_uint256_to_t_uint256",
                                            "nodeType": "YulIdentifier",
                                            "src": "5761:43:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "5761:65:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "5761:65:6"
                                }
                            ]
                        },
                        "name": "storage_set_to_zero_t_uint256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "slot",
                                "nodeType": "YulTypedName",
                                "src": "5682:4:6",
                                "type": ""
                            },
                            {
                                "name": "offset",
                                "nodeType": "YulTypedName",
                                "src": "5688:6:6",
                                "type": ""
                            }
                        ],
                        "src": "5643:189:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "5888:136:6",
                            "statements": [
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "5955:63:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [
                                                        {
                                                            "name": "start",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "5999:5:6"
                                                        },
                                                        {
                                                            "kind": "number",
                                                            "nodeType": "YulLiteral",
                                                            "src": "6006:1:6",
                                                            "type": "",
                                                            "value": "0"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "storage_set_to_zero_t_uint256",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "5969:29:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "5969:39:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "5969:39:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "name": "start",
                                                "nodeType": "YulIdentifier",
                                                "src": "5908:5:6"
                                            },
                                            {
                                                "name": "end",
                                                "nodeType": "YulIdentifier",
                                                "src": "5915:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "lt",
                                            "nodeType": "YulIdentifier",
                                            "src": "5905:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "5905:14:6"
                                    },
                                    "nodeType": "YulForLoop",
                                    "post": {
                                        "nodeType": "YulBlock",
                                        "src": "5920:26:6",
                                        "statements": [
                                            {
                                                "nodeType": "YulAssignment",
                                                "src": "5922:22:6",
                                                "value": {
                                                    "arguments": [
                                                        {
                                                            "name": "start",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "5935:5:6"
                                                        },
                                                        {
                                                            "kind": "number",
                                                            "nodeType": "YulLiteral",
                                                            "src": "5942:1:6",
                                                            "type": "",
                                                            "value": "1"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "add",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "5931:3:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "5931:13:6"
                                                },
                                                "variableNames": [
                                                    {
                                                        "name": "start",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "5922:5:6"
                                                    }
                                                ]
                                            }
                                        ]
                                    },
                                    "pre": {
                                        "nodeType": "YulBlock",
                                        "src": "5902:2:6",
                                        "statements": []
                                    },
                                    "src": "5898:120:6"
                                }
                            ]
                        },
                        "name": "clear_storage_range_t_bytes1",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "start",
                                "nodeType": "YulTypedName",
                                "src": "5876:5:6",
                                "type": ""
                            },
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "5883:3:6",
                                "type": ""
                            }
                        ],
                        "src": "5838:186:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "6109:464:6",
                            "statements": [
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "6135:431:6",
                                        "statements": [
                                            {
                                                "nodeType": "YulVariableDeclaration",
                                                "src": "6149:54:6",
                                                "value": {
                                                    "arguments": [
                                                        {
                                                            "name": "array",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "6197:5:6"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "array_dataslot_t_string_storage",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "6165:31:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "6165:38:6"
                                                },
                                                "variables": [
                                                    {
                                                        "name": "dataArea",
                                                        "nodeType": "YulTypedName",
                                                        "src": "6153:8:6",
                                                        "type": ""
                                                    }
                                                ]
                                            },
                                            {
                                                "nodeType": "YulVariableDeclaration",
                                                "src": "6216:63:6",
                                                "value": {
                                                    "arguments": [
                                                        {
                                                            "name": "dataArea",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "6239:8:6"
                                                        },
                                                        {
                                                            "arguments": [
                                                                {
                                                                    "name": "startIndex",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "6267:10:6"
                                                                }
                                                            ],
                                                            "functionName": {
                                                                "name": "divide_by_32_ceil",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "6249:17:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "6249:29:6"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "add",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "6235:3:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "6235:44:6"
                                                },
                                                "variables": [
                                                    {
                                                        "name": "deleteStart",
                                                        "nodeType": "YulTypedName",
                                                        "src": "6220:11:6",
                                                        "type": ""
                                                    }
                                                ]
                                            },
                                            {
                                                "body": {
                                                    "nodeType": "YulBlock",
                                                    "src": "6436:27:6",
                                                    "statements": [
                                                        {
                                                            "nodeType": "YulAssignment",
                                                            "src": "6438:23:6",
                                                            "value": {
                                                                "name": "dataArea",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "6453:8:6"
                                                            },
                                                            "variableNames": [
                                                                {
                                                                    "name": "deleteStart",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "6438:11:6"
                                                                }
                                                            ]
                                                        }
                                                    ]
                                                },
                                                "condition": {
                                                    "arguments": [
                                                        {
                                                            "name": "startIndex",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "6420:10:6"
                                                        },
                                                        {
                                                            "kind": "number",
                                                            "nodeType": "YulLiteral",
                                                            "src": "6432:2:6",
                                                            "type": "",
                                                            "value": "32"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "lt",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "6417:2:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "6417:18:6"
                                                },
                                                "nodeType": "YulIf",
                                                "src": "6414:49:6"
                                            },
                                            {
                                                "expression": {
                                                    "arguments": [
                                                        {
                                                            "name": "deleteStart",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "6505:11:6"
                                                        },
                                                        {
                                                            "arguments": [
                                                                {
                                                                    "name": "dataArea",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "6522:8:6"
                                                                },
                                                                {
                                                                    "arguments": [
                                                                        {
                                                                            "name": "len",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "6550:3:6"
                                                                        }
                                                                    ],
                                                                    "functionName": {
                                                                        "name": "divide_by_32_ceil",
                                                                        "nodeType": "YulIdentifier",
                                                                        "src": "6532:17:6"
                                                                    },
                                                                    "nodeType": "YulFunctionCall",
                                                                    "src": "6532:22:6"
                                                                }
                                                            ],
                                                            "functionName": {
                                                                "name": "add",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "6518:3:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "6518:37:6"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "clear_storage_range_t_bytes1",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "6476:28:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "6476:80:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "6476:80:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "name": "len",
                                                "nodeType": "YulIdentifier",
                                                "src": "6126:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6131:2:6",
                                                "type": "",
                                                "value": "31"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "gt",
                                            "nodeType": "YulIdentifier",
                                            "src": "6123:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6123:11:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "6120:446:6"
                                }
                            ]
                        },
                        "name": "clean_up_bytearray_end_slots_t_string_storage",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "array",
                                "nodeType": "YulTypedName",
                                "src": "6085:5:6",
                                "type": ""
                            },
                            {
                                "name": "len",
                                "nodeType": "YulTypedName",
                                "src": "6092:3:6",
                                "type": ""
                            },
                            {
                                "name": "startIndex",
                                "nodeType": "YulTypedName",
                                "src": "6097:10:6",
                                "type": ""
                            }
                        ],
                        "src": "6030:543:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "6642:54:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "6652:37:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "bits",
                                                "nodeType": "YulIdentifier",
                                                "src": "6677:4:6"
                                            },
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "6683:5:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "shr",
                                            "nodeType": "YulIdentifier",
                                            "src": "6673:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6673:16:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "newValue",
                                            "nodeType": "YulIdentifier",
                                            "src": "6652:8:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "shift_right_unsigned_dynamic",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "bits",
                                "nodeType": "YulTypedName",
                                "src": "6617:4:6",
                                "type": ""
                            },
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "6623:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "newValue",
                                "nodeType": "YulTypedName",
                                "src": "6633:8:6",
                                "type": ""
                            }
                        ],
                        "src": "6579:117:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "6753:118:6",
                            "statements": [
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "6763:68:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "kind": "number",
                                                                "nodeType": "YulLiteral",
                                                                "src": "6812:1:6",
                                                                "type": "",
                                                                "value": "8"
                                                            },
                                                            {
                                                                "name": "bytes",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "6815:5:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "mul",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "6808:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "6808:13:6"
                                                    },
                                                    {
                                                        "arguments": [
                                                            {
                                                                "kind": "number",
                                                                "nodeType": "YulLiteral",
                                                                "src": "6827:1:6",
                                                                "type": "",
                                                                "value": "0"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "not",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "6823:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "6823:6:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "shift_right_unsigned_dynamic",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "6779:28:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "6779:51:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "not",
                                            "nodeType": "YulIdentifier",
                                            "src": "6775:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6775:56:6"
                                    },
                                    "variables": [
                                        {
                                            "name": "mask",
                                            "nodeType": "YulTypedName",
                                            "src": "6767:4:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "6840:25:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "data",
                                                "nodeType": "YulIdentifier",
                                                "src": "6854:4:6"
                                            },
                                            {
                                                "name": "mask",
                                                "nodeType": "YulIdentifier",
                                                "src": "6860:4:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "and",
                                            "nodeType": "YulIdentifier",
                                            "src": "6850:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6850:15:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "result",
                                            "nodeType": "YulIdentifier",
                                            "src": "6840:6:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "mask_bytes_dynamic",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "data",
                                "nodeType": "YulTypedName",
                                "src": "6730:4:6",
                                "type": ""
                            },
                            {
                                "name": "bytes",
                                "nodeType": "YulTypedName",
                                "src": "6736:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "result",
                                "nodeType": "YulTypedName",
                                "src": "6746:6:6",
                                "type": ""
                            }
                        ],
                        "src": "6702:169:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "6957:214:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "7090:37:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "data",
                                                "nodeType": "YulIdentifier",
                                                "src": "7117:4:6"
                                            },
                                            {
                                                "name": "len",
                                                "nodeType": "YulIdentifier",
                                                "src": "7123:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mask_bytes_dynamic",
                                            "nodeType": "YulIdentifier",
                                            "src": "7098:18:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7098:29:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "data",
                                            "nodeType": "YulIdentifier",
                                            "src": "7090:4:6"
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "7136:29:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "data",
                                                "nodeType": "YulIdentifier",
                                                "src": "7147:4:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "7157:1:6",
                                                        "type": "",
                                                        "value": "2"
                                                    },
                                                    {
                                                        "name": "len",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "7160:3:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "mul",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "7153:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "7153:11:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "or",
                                            "nodeType": "YulIdentifier",
                                            "src": "7144:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7144:21:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "used",
                                            "nodeType": "YulIdentifier",
                                            "src": "7136:4:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "extract_used_part_and_set_length_of_short_byte_array",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "data",
                                "nodeType": "YulTypedName",
                                "src": "6938:4:6",
                                "type": ""
                            },
                            {
                                "name": "len",
                                "nodeType": "YulTypedName",
                                "src": "6944:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "used",
                                "nodeType": "YulTypedName",
                                "src": "6952:4:6",
                                "type": ""
                            }
                        ],
                        "src": "6876:295:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "7268:1303:6",
                            "statements": [
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "7279:51:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "src",
                                                "nodeType": "YulIdentifier",
                                                "src": "7326:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "array_length_t_string_memory_ptr",
                                            "nodeType": "YulIdentifier",
                                            "src": "7293:32:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7293:37:6"
                                    },
                                    "variables": [
                                        {
                                            "name": "newLen",
                                            "nodeType": "YulTypedName",
                                            "src": "7283:6:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "7415:22:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "panic_error_0x41",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "7417:16:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "7417:18:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "7417:18:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "name": "newLen",
                                                "nodeType": "YulIdentifier",
                                                "src": "7387:6:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "7395:18:6",
                                                "type": "",
                                                "value": "0xffffffffffffffff"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "gt",
                                            "nodeType": "YulIdentifier",
                                            "src": "7384:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7384:30:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "7381:56:6"
                                },
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "7447:52:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "slot",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "7493:4:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sload",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "7487:5:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "7487:11:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "extract_byte_array_length",
                                            "nodeType": "YulIdentifier",
                                            "src": "7461:25:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7461:38:6"
                                    },
                                    "variables": [
                                        {
                                            "name": "oldLen",
                                            "nodeType": "YulTypedName",
                                            "src": "7451:6:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "slot",
                                                "nodeType": "YulIdentifier",
                                                "src": "7592:4:6"
                                            },
                                            {
                                                "name": "oldLen",
                                                "nodeType": "YulIdentifier",
                                                "src": "7598:6:6"
                                            },
                                            {
                                                "name": "newLen",
                                                "nodeType": "YulIdentifier",
                                                "src": "7606:6:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "clean_up_bytearray_end_slots_t_string_storage",
                                            "nodeType": "YulIdentifier",
                                            "src": "7546:45:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7546:67:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "7546:67:6"
                                },
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "7623:18:6",
                                    "value": {
                                        "kind": "number",
                                        "nodeType": "YulLiteral",
                                        "src": "7640:1:6",
                                        "type": "",
                                        "value": "0"
                                    },
                                    "variables": [
                                        {
                                            "name": "srcOffset",
                                            "nodeType": "YulTypedName",
                                            "src": "7627:9:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "7651:17:6",
                                    "value": {
                                        "kind": "number",
                                        "nodeType": "YulLiteral",
                                        "src": "7664:4:6",
                                        "type": "",
                                        "value": "0x20"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "srcOffset",
                                            "nodeType": "YulIdentifier",
                                            "src": "7651:9:6"
                                        }
                                    ]
                                },
                                {
                                    "cases": [
                                        {
                                            "body": {
                                                "nodeType": "YulBlock",
                                                "src": "7715:611:6",
                                                "statements": [
                                                    {
                                                        "nodeType": "YulVariableDeclaration",
                                                        "src": "7729:37:6",
                                                        "value": {
                                                            "arguments": [
                                                                {
                                                                    "name": "newLen",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "7748:6:6"
                                                                },
                                                                {
                                                                    "arguments": [
                                                                        {
                                                                            "kind": "number",
                                                                            "nodeType": "YulLiteral",
                                                                            "src": "7760:4:6",
                                                                            "type": "",
                                                                            "value": "0x1f"
                                                                        }
                                                                    ],
                                                                    "functionName": {
                                                                        "name": "not",
                                                                        "nodeType": "YulIdentifier",
                                                                        "src": "7756:3:6"
                                                                    },
                                                                    "nodeType": "YulFunctionCall",
                                                                    "src": "7756:9:6"
                                                                }
                                                            ],
                                                            "functionName": {
                                                                "name": "and",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "7744:3:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "7744:22:6"
                                                        },
                                                        "variables": [
                                                            {
                                                                "name": "loopEnd",
                                                                "nodeType": "YulTypedName",
                                                                "src": "7733:7:6",
                                                                "type": ""
                                                            }
                                                        ]
                                                    },
                                                    {
                                                        "nodeType": "YulVariableDeclaration",
                                                        "src": "7780:51:6",
                                                        "value": {
                                                            "arguments": [
                                                                {
                                                                    "name": "slot",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "7826:4:6"
                                                                }
                                                            ],
                                                            "functionName": {
                                                                "name": "array_dataslot_t_string_storage",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "7794:31:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "7794:37:6"
                                                        },
                                                        "variables": [
                                                            {
                                                                "name": "dstPtr",
                                                                "nodeType": "YulTypedName",
                                                                "src": "7784:6:6",
                                                                "type": ""
                                                            }
                                                        ]
                                                    },
                                                    {
                                                        "nodeType": "YulVariableDeclaration",
                                                        "src": "7844:10:6",
                                                        "value": {
                                                            "kind": "number",
                                                            "nodeType": "YulLiteral",
                                                            "src": "7853:1:6",
                                                            "type": "",
                                                            "value": "0"
                                                        },
                                                        "variables": [
                                                            {
                                                                "name": "i",
                                                                "nodeType": "YulTypedName",
                                                                "src": "7848:1:6",
                                                                "type": ""
                                                            }
                                                        ]
                                                    },
                                                    {
                                                        "body": {
                                                            "nodeType": "YulBlock",
                                                            "src": "7912:163:6",
                                                            "statements": [
                                                                {
                                                                    "expression": {
                                                                        "arguments": [
                                                                            {
                                                                                "name": "dstPtr",
                                                                                "nodeType": "YulIdentifier",
                                                                                "src": "7937:6:6"
                                                                            },
                                                                            {
                                                                                "arguments": [
                                                                                    {
                                                                                        "arguments": [
                                                                                            {
                                                                                                "name": "src",
                                                                                                "nodeType": "YulIdentifier",
                                                                                                "src": "7955:3:6"
                                                                                            },
                                                                                            {
                                                                                                "name": "srcOffset",
                                                                                                "nodeType": "YulIdentifier",
                                                                                                "src": "7960:9:6"
                                                                                            }
                                                                                        ],
                                                                                        "functionName": {
                                                                                            "name": "add",
                                                                                            "nodeType": "YulIdentifier",
                                                                                            "src": "7951:3:6"
                                                                                        },
                                                                                        "nodeType": "YulFunctionCall",
                                                                                        "src": "7951:19:6"
                                                                                    }
                                                                                ],
                                                                                "functionName": {
                                                                                    "name": "mload",
                                                                                    "nodeType": "YulIdentifier",
                                                                                    "src": "7945:5:6"
                                                                                },
                                                                                "nodeType": "YulFunctionCall",
                                                                                "src": "7945:26:6"
                                                                            }
                                                                        ],
                                                                        "functionName": {
                                                                            "name": "sstore",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "7930:6:6"
                                                                        },
                                                                        "nodeType": "YulFunctionCall",
                                                                        "src": "7930:42:6"
                                                                    },
                                                                    "nodeType": "YulExpressionStatement",
                                                                    "src": "7930:42:6"
                                                                },
                                                                {
                                                                    "nodeType": "YulAssignment",
                                                                    "src": "7989:24:6",
                                                                    "value": {
                                                                        "arguments": [
                                                                            {
                                                                                "name": "dstPtr",
                                                                                "nodeType": "YulIdentifier",
                                                                                "src": "8003:6:6"
                                                                            },
                                                                            {
                                                                                "kind": "number",
                                                                                "nodeType": "YulLiteral",
                                                                                "src": "8011:1:6",
                                                                                "type": "",
                                                                                "value": "1"
                                                                            }
                                                                        ],
                                                                        "functionName": {
                                                                            "name": "add",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "7999:3:6"
                                                                        },
                                                                        "nodeType": "YulFunctionCall",
                                                                        "src": "7999:14:6"
                                                                    },
                                                                    "variableNames": [
                                                                        {
                                                                            "name": "dstPtr",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "7989:6:6"
                                                                        }
                                                                    ]
                                                                },
                                                                {
                                                                    "nodeType": "YulAssignment",
                                                                    "src": "8030:31:6",
                                                                    "value": {
                                                                        "arguments": [
                                                                            {
                                                                                "name": "srcOffset",
                                                                                "nodeType": "YulIdentifier",
                                                                                "src": "8047:9:6"
                                                                            },
                                                                            {
                                                                                "kind": "number",
                                                                                "nodeType": "YulLiteral",
                                                                                "src": "8058:2:6",
                                                                                "type": "",
                                                                                "value": "32"
                                                                            }
                                                                        ],
                                                                        "functionName": {
                                                                            "name": "add",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "8043:3:6"
                                                                        },
                                                                        "nodeType": "YulFunctionCall",
                                                                        "src": "8043:18:6"
                                                                    },
                                                                    "variableNames": [
                                                                        {
                                                                            "name": "srcOffset",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "8030:9:6"
                                                                        }
                                                                    ]
                                                                }
                                                            ]
                                                        },
                                                        "condition": {
                                                            "arguments": [
                                                                {
                                                                    "name": "i",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "7878:1:6"
                                                                },
                                                                {
                                                                    "name": "loopEnd",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "7881:7:6"
                                                                }
                                                            ],
                                                            "functionName": {
                                                                "name": "lt",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "7875:2:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "7875:14:6"
                                                        },
                                                        "nodeType": "YulForLoop",
                                                        "post": {
                                                            "nodeType": "YulBlock",
                                                            "src": "7890:21:6",
                                                            "statements": [
                                                                {
                                                                    "nodeType": "YulAssignment",
                                                                    "src": "7892:17:6",
                                                                    "value": {
                                                                        "arguments": [
                                                                            {
                                                                                "name": "i",
                                                                                "nodeType": "YulIdentifier",
                                                                                "src": "7901:1:6"
                                                                            },
                                                                            {
                                                                                "kind": "number",
                                                                                "nodeType": "YulLiteral",
                                                                                "src": "7904:4:6",
                                                                                "type": "",
                                                                                "value": "0x20"
                                                                            }
                                                                        ],
                                                                        "functionName": {
                                                                            "name": "add",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "7897:3:6"
                                                                        },
                                                                        "nodeType": "YulFunctionCall",
                                                                        "src": "7897:12:6"
                                                                    },
                                                                    "variableNames": [
                                                                        {
                                                                            "name": "i",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "7892:1:6"
                                                                        }
                                                                    ]
                                                                }
                                                            ]
                                                        },
                                                        "pre": {
                                                            "nodeType": "YulBlock",
                                                            "src": "7871:3:6",
                                                            "statements": []
                                                        },
                                                        "src": "7867:208:6"
                                                    },
                                                    {
                                                        "body": {
                                                            "nodeType": "YulBlock",
                                                            "src": "8111:156:6",
                                                            "statements": [
                                                                {
                                                                    "nodeType": "YulVariableDeclaration",
                                                                    "src": "8129:43:6",
                                                                    "value": {
                                                                        "arguments": [
                                                                            {
                                                                                "arguments": [
                                                                                    {
                                                                                        "name": "src",
                                                                                        "nodeType": "YulIdentifier",
                                                                                        "src": "8156:3:6"
                                                                                    },
                                                                                    {
                                                                                        "name": "srcOffset",
                                                                                        "nodeType": "YulIdentifier",
                                                                                        "src": "8161:9:6"
                                                                                    }
                                                                                ],
                                                                                "functionName": {
                                                                                    "name": "add",
                                                                                    "nodeType": "YulIdentifier",
                                                                                    "src": "8152:3:6"
                                                                                },
                                                                                "nodeType": "YulFunctionCall",
                                                                                "src": "8152:19:6"
                                                                            }
                                                                        ],
                                                                        "functionName": {
                                                                            "name": "mload",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "8146:5:6"
                                                                        },
                                                                        "nodeType": "YulFunctionCall",
                                                                        "src": "8146:26:6"
                                                                    },
                                                                    "variables": [
                                                                        {
                                                                            "name": "lastValue",
                                                                            "nodeType": "YulTypedName",
                                                                            "src": "8133:9:6",
                                                                            "type": ""
                                                                        }
                                                                    ]
                                                                },
                                                                {
                                                                    "expression": {
                                                                        "arguments": [
                                                                            {
                                                                                "name": "dstPtr",
                                                                                "nodeType": "YulIdentifier",
                                                                                "src": "8196:6:6"
                                                                            },
                                                                            {
                                                                                "arguments": [
                                                                                    {
                                                                                        "name": "lastValue",
                                                                                        "nodeType": "YulIdentifier",
                                                                                        "src": "8223:9:6"
                                                                                    },
                                                                                    {
                                                                                        "arguments": [
                                                                                            {
                                                                                                "name": "newLen",
                                                                                                "nodeType": "YulIdentifier",
                                                                                                "src": "8238:6:6"
                                                                                            },
                                                                                            {
                                                                                                "kind": "number",
                                                                                                "nodeType": "YulLiteral",
                                                                                                "src": "8246:4:6",
                                                                                                "type": "",
                                                                                                "value": "0x1f"
                                                                                            }
                                                                                        ],
                                                                                        "functionName": {
                                                                                            "name": "and",
                                                                                            "nodeType": "YulIdentifier",
                                                                                            "src": "8234:3:6"
                                                                                        },
                                                                                        "nodeType": "YulFunctionCall",
                                                                                        "src": "8234:17:6"
                                                                                    }
                                                                                ],
                                                                                "functionName": {
                                                                                    "name": "mask_bytes_dynamic",
                                                                                    "nodeType": "YulIdentifier",
                                                                                    "src": "8204:18:6"
                                                                                },
                                                                                "nodeType": "YulFunctionCall",
                                                                                "src": "8204:48:6"
                                                                            }
                                                                        ],
                                                                        "functionName": {
                                                                            "name": "sstore",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "8189:6:6"
                                                                        },
                                                                        "nodeType": "YulFunctionCall",
                                                                        "src": "8189:64:6"
                                                                    },
                                                                    "nodeType": "YulExpressionStatement",
                                                                    "src": "8189:64:6"
                                                                }
                                                            ]
                                                        },
                                                        "condition": {
                                                            "arguments": [
                                                                {
                                                                    "name": "loopEnd",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "8094:7:6"
                                                                },
                                                                {
                                                                    "name": "newLen",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "8103:6:6"
                                                                }
                                                            ],
                                                            "functionName": {
                                                                "name": "lt",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "8091:2:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "8091:19:6"
                                                        },
                                                        "nodeType": "YulIf",
                                                        "src": "8088:179:6"
                                                    },
                                                    {
                                                        "expression": {
                                                            "arguments": [
                                                                {
                                                                    "name": "slot",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "8287:4:6"
                                                                },
                                                                {
                                                                    "arguments": [
                                                                        {
                                                                            "arguments": [
                                                                                {
                                                                                    "name": "newLen",
                                                                                    "nodeType": "YulIdentifier",
                                                                                    "src": "8301:6:6"
                                                                                },
                                                                                {
                                                                                    "kind": "number",
                                                                                    "nodeType": "YulLiteral",
                                                                                    "src": "8309:1:6",
                                                                                    "type": "",
                                                                                    "value": "2"
                                                                                }
                                                                            ],
                                                                            "functionName": {
                                                                                "name": "mul",
                                                                                "nodeType": "YulIdentifier",
                                                                                "src": "8297:3:6"
                                                                            },
                                                                            "nodeType": "YulFunctionCall",
                                                                            "src": "8297:14:6"
                                                                        },
                                                                        {
                                                                            "kind": "number",
                                                                            "nodeType": "YulLiteral",
                                                                            "src": "8313:1:6",
                                                                            "type": "",
                                                                            "value": "1"
                                                                        }
                                                                    ],
                                                                    "functionName": {
                                                                        "name": "add",
                                                                        "nodeType": "YulIdentifier",
                                                                        "src": "8293:3:6"
                                                                    },
                                                                    "nodeType": "YulFunctionCall",
                                                                    "src": "8293:22:6"
                                                                }
                                                            ],
                                                            "functionName": {
                                                                "name": "sstore",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "8280:6:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "8280:36:6"
                                                        },
                                                        "nodeType": "YulExpressionStatement",
                                                        "src": "8280:36:6"
                                                    }
                                                ]
                                            },
                                            "nodeType": "YulCase",
                                            "src": "7708:618:6",
                                            "value": {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "7713:1:6",
                                                "type": "",
                                                "value": "1"
                                            }
                                        },
                                        {
                                            "body": {
                                                "nodeType": "YulBlock",
                                                "src": "8343:222:6",
                                                "statements": [
                                                    {
                                                        "nodeType": "YulVariableDeclaration",
                                                        "src": "8357:14:6",
                                                        "value": {
                                                            "kind": "number",
                                                            "nodeType": "YulLiteral",
                                                            "src": "8370:1:6",
                                                            "type": "",
                                                            "value": "0"
                                                        },
                                                        "variables": [
                                                            {
                                                                "name": "value",
                                                                "nodeType": "YulTypedName",
                                                                "src": "8361:5:6",
                                                                "type": ""
                                                            }
                                                        ]
                                                    },
                                                    {
                                                        "body": {
                                                            "nodeType": "YulBlock",
                                                            "src": "8394:67:6",
                                                            "statements": [
                                                                {
                                                                    "nodeType": "YulAssignment",
                                                                    "src": "8412:35:6",
                                                                    "value": {
                                                                        "arguments": [
                                                                            {
                                                                                "arguments": [
                                                                                    {
                                                                                        "name": "src",
                                                                                        "nodeType": "YulIdentifier",
                                                                                        "src": "8431:3:6"
                                                                                    },
                                                                                    {
                                                                                        "name": "srcOffset",
                                                                                        "nodeType": "YulIdentifier",
                                                                                        "src": "8436:9:6"
                                                                                    }
                                                                                ],
                                                                                "functionName": {
                                                                                    "name": "add",
                                                                                    "nodeType": "YulIdentifier",
                                                                                    "src": "8427:3:6"
                                                                                },
                                                                                "nodeType": "YulFunctionCall",
                                                                                "src": "8427:19:6"
                                                                            }
                                                                        ],
                                                                        "functionName": {
                                                                            "name": "mload",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "8421:5:6"
                                                                        },
                                                                        "nodeType": "YulFunctionCall",
                                                                        "src": "8421:26:6"
                                                                    },
                                                                    "variableNames": [
                                                                        {
                                                                            "name": "value",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "8412:5:6"
                                                                        }
                                                                    ]
                                                                }
                                                            ]
                                                        },
                                                        "condition": {
                                                            "name": "newLen",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "8387:6:6"
                                                        },
                                                        "nodeType": "YulIf",
                                                        "src": "8384:77:6"
                                                    },
                                                    {
                                                        "expression": {
                                                            "arguments": [
                                                                {
                                                                    "name": "slot",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "8481:4:6"
                                                                },
                                                                {
                                                                    "arguments": [
                                                                        {
                                                                            "name": "value",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "8540:5:6"
                                                                        },
                                                                        {
                                                                            "name": "newLen",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "8547:6:6"
                                                                        }
                                                                    ],
                                                                    "functionName": {
                                                                        "name": "extract_used_part_and_set_length_of_short_byte_array",
                                                                        "nodeType": "YulIdentifier",
                                                                        "src": "8487:52:6"
                                                                    },
                                                                    "nodeType": "YulFunctionCall",
                                                                    "src": "8487:67:6"
                                                                }
                                                            ],
                                                            "functionName": {
                                                                "name": "sstore",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "8474:6:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "8474:81:6"
                                                        },
                                                        "nodeType": "YulExpressionStatement",
                                                        "src": "8474:81:6"
                                                    }
                                                ]
                                            },
                                            "nodeType": "YulCase",
                                            "src": "8335:230:6",
                                            "value": "default"
                                        }
                                    ],
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "newLen",
                                                "nodeType": "YulIdentifier",
                                                "src": "7688:6:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "7696:2:6",
                                                "type": "",
                                                "value": "31"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "gt",
                                            "nodeType": "YulIdentifier",
                                            "src": "7685:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7685:14:6"
                                    },
                                    "nodeType": "YulSwitch",
                                    "src": "7678:887:6"
                                }
                            ]
                        },
                        "name": "copy_byte_array_to_storage_from_t_string_memory_ptr_to_t_string_storage",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "slot",
                                "nodeType": "YulTypedName",
                                "src": "7257:4:6",
                                "type": ""
                            },
                            {
                                "name": "src",
                                "nodeType": "YulTypedName",
                                "src": "7263:3:6",
                                "type": ""
                            }
                        ],
                        "src": "7176:1395:6"
                    }
                ]
            },
            "contents": "{\n\n    function allocate_unbounded() -> memPtr {\n        memPtr := mload(64)\n    }\n\n    function revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b() {\n        revert(0, 0)\n    }\n\n    function revert_error_c1322bf8034eace5e0b5c7295db60986aa89aae5e0ea0873e4689e076861a5db() {\n        revert(0, 0)\n    }\n\n    function revert_error_1b9f4a0a5773e33b91aa01db23bf8c55fce1411167c872835e7fa00a4f17d46d() {\n        revert(0, 0)\n    }\n\n    function revert_error_987264b3b1d58a9c7f8255e93e81c77d86d6299019c33110a076957a3e06e2ae() {\n        revert(0, 0)\n    }\n\n    function round_up_to_mul_of_32(value) -> result {\n        result := and(add(value, 31), not(31))\n    }\n\n    function panic_error_0x41() {\n        mstore(0, 35408467139433450592217433187231851964531694900788300625387963629091585785856)\n        mstore(4, 0x41)\n        revert(0, 0x24)\n    }\n\n    function finalize_allocation(memPtr, size) {\n        let newFreePtr := add(memPtr, round_up_to_mul_of_32(size))\n        // protect against overflow\n        if or(gt(newFreePtr, 0xffffffffffffffff), lt(newFreePtr, memPtr)) { panic_error_0x41() }\n        mstore(64, newFreePtr)\n    }\n\n    function allocate_memory(size) -> memPtr {\n        memPtr := allocate_unbounded()\n        finalize_allocation(memPtr, size)\n    }\n\n    function array_allocation_size_t_string_memory_ptr(length) -> size {\n        // Make sure we can allocate memory without overflow\n        if gt(length, 0xffffffffffffffff) { panic_error_0x41() }\n\n        size := round_up_to_mul_of_32(length)\n\n        // add length slot\n        size := add(size, 0x20)\n\n    }\n\n    function copy_memory_to_memory_with_cleanup(src, dst, length) {\n        let i := 0\n        for { } lt(i, length) { i := add(i, 32) }\n        {\n            mstore(add(dst, i), mload(add(src, i)))\n        }\n        mstore(add(dst, length), 0)\n    }\n\n    function abi_decode_available_length_t_string_memory_ptr_fromMemory(src, length, end) -> array {\n        array := allocate_memory(array_allocation_size_t_string_memory_ptr(length))\n        mstore(array, length)\n        let dst := add(array, 0x20)\n        if gt(add(src, length), end) { revert_error_987264b3b1d58a9c7f8255e93e81c77d86d6299019c33110a076957a3e06e2ae() }\n        copy_memory_to_memory_with_cleanup(src, dst, length)\n    }\n\n    // string\n    function abi_decode_t_string_memory_ptr_fromMemory(offset, end) -> array {\n        if iszero(slt(add(offset, 0x1f), end)) { revert_error_1b9f4a0a5773e33b91aa01db23bf8c55fce1411167c872835e7fa00a4f17d46d() }\n        let length := mload(offset)\n        array := abi_decode_available_length_t_string_memory_ptr_fromMemory(add(offset, 0x20), length, end)\n    }\n\n    function abi_decode_tuple_t_string_memory_ptrt_string_memory_ptr_fromMemory(headStart, dataEnd) -> value0, value1 {\n        if slt(sub(dataEnd, headStart), 64) { revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b() }\n\n        {\n\n            let offset := mload(add(headStart, 0))\n            if gt(offset, 0xffffffffffffffff) { revert_error_c1322bf8034eace5e0b5c7295db60986aa89aae5e0ea0873e4689e076861a5db() }\n\n            value0 := abi_decode_t_string_memory_ptr_fromMemory(add(headStart, offset), dataEnd)\n        }\n\n        {\n\n            let offset := mload(add(headStart, 32))\n            if gt(offset, 0xffffffffffffffff) { revert_error_c1322bf8034eace5e0b5c7295db60986aa89aae5e0ea0873e4689e076861a5db() }\n\n            value1 := abi_decode_t_string_memory_ptr_fromMemory(add(headStart, offset), dataEnd)\n        }\n\n    }\n\n    function array_length_t_string_memory_ptr(value) -> length {\n\n        length := mload(value)\n\n    }\n\n    function panic_error_0x22() {\n        mstore(0, 35408467139433450592217433187231851964531694900788300625387963629091585785856)\n        mstore(4, 0x22)\n        revert(0, 0x24)\n    }\n\n    function extract_byte_array_length(data) -> length {\n        length := div(data, 2)\n        let outOfPlaceEncoding := and(data, 1)\n        if iszero(outOfPlaceEncoding) {\n            length := and(length, 0x7f)\n        }\n\n        if eq(outOfPlaceEncoding, lt(length, 32)) {\n            panic_error_0x22()\n        }\n    }\n\n    function array_dataslot_t_string_storage(ptr) -> data {\n        data := ptr\n\n        mstore(0, ptr)\n        data := keccak256(0, 0x20)\n\n    }\n\n    function divide_by_32_ceil(value) -> result {\n        result := div(add(value, 31), 32)\n    }\n\n    function shift_left_dynamic(bits, value) -> newValue {\n        newValue :=\n\n        shl(bits, value)\n\n    }\n\n    function update_byte_slice_dynamic32(value, shiftBytes, toInsert) -> result {\n        let shiftBits := mul(shiftBytes, 8)\n        let mask := shift_left_dynamic(shiftBits, 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff)\n        toInsert := shift_left_dynamic(shiftBits, toInsert)\n        value := and(value, not(mask))\n        result := or(value, and(toInsert, mask))\n    }\n\n    function cleanup_t_uint256(value) -> cleaned {\n        cleaned := value\n    }\n\n    function identity(value) -> ret {\n        ret := value\n    }\n\n    function convert_t_uint256_to_t_uint256(value) -> converted {\n        converted := cleanup_t_uint256(identity(cleanup_t_uint256(value)))\n    }\n\n    function prepare_store_t_uint256(value) -> ret {\n        ret := value\n    }\n\n    function update_storage_value_t_uint256_to_t_uint256(slot, offset, value_0) {\n        let convertedValue_0 := convert_t_uint256_to_t_uint256(value_0)\n        sstore(slot, update_byte_slice_dynamic32(sload(slot), offset, prepare_store_t_uint256(convertedValue_0)))\n    }\n\n    function zero_value_for_split_t_uint256() -> ret {\n        ret := 0\n    }\n\n    function storage_set_to_zero_t_uint256(slot, offset) {\n        let zero_0 := zero_value_for_split_t_uint256()\n        update_storage_value_t_uint256_to_t_uint256(slot, offset, zero_0)\n    }\n\n    function clear_storage_range_t_bytes1(start, end) {\n        for {} lt(start, end) { start := add(start, 1) }\n        {\n            storage_set_to_zero_t_uint256(start, 0)\n        }\n    }\n\n    function clean_up_bytearray_end_slots_t_string_storage(array, len, startIndex) {\n\n        if gt(len, 31) {\n            let dataArea := array_dataslot_t_string_storage(array)\n            let deleteStart := add(dataArea, divide_by_32_ceil(startIndex))\n            // If we are clearing array to be short byte array, we want to clear only data starting from array data area.\n            if lt(startIndex, 32) { deleteStart := dataArea }\n            clear_storage_range_t_bytes1(deleteStart, add(dataArea, divide_by_32_ceil(len)))\n        }\n\n    }\n\n    function shift_right_unsigned_dynamic(bits, value) -> newValue {\n        newValue :=\n\n        shr(bits, value)\n\n    }\n\n    function mask_bytes_dynamic(data, bytes) -> result {\n        let mask := not(shift_right_unsigned_dynamic(mul(8, bytes), not(0)))\n        result := and(data, mask)\n    }\n    function extract_used_part_and_set_length_of_short_byte_array(data, len) -> used {\n        // we want to save only elements that are part of the array after resizing\n        // others should be set to zero\n        data := mask_bytes_dynamic(data, len)\n        used := or(data, mul(2, len))\n    }\n    function copy_byte_array_to_storage_from_t_string_memory_ptr_to_t_string_storage(slot, src) {\n\n        let newLen := array_length_t_string_memory_ptr(src)\n        // Make sure array length is sane\n        if gt(newLen, 0xffffffffffffffff) { panic_error_0x41() }\n\n        let oldLen := extract_byte_array_length(sload(slot))\n\n        // potentially truncate data\n        clean_up_bytearray_end_slots_t_string_storage(slot, oldLen, newLen)\n\n        let srcOffset := 0\n\n        srcOffset := 0x20\n\n        switch gt(newLen, 31)\n        case 1 {\n            let loopEnd := and(newLen, not(0x1f))\n\n            let dstPtr := array_dataslot_t_string_storage(slot)\n            let i := 0\n            for { } lt(i, loopEnd) { i := add(i, 0x20) } {\n                sstore(dstPtr, mload(add(src, srcOffset)))\n                dstPtr := add(dstPtr, 1)\n                srcOffset := add(srcOffset, 32)\n            }\n            if lt(loopEnd, newLen) {\n                let lastValue := mload(add(src, srcOffset))\n                sstore(dstPtr, mask_bytes_dynamic(lastValue, and(newLen, 0x1f)))\n            }\n            sstore(slot, add(mul(newLen, 2), 1))\n        }\n        default {\n            let value := 0\n            if newLen {\n                value := mload(add(src, srcOffset))\n            }\n            sstore(slot, extract_used_part_and_set_length_of_short_byte_array(value, newLen))\n        }\n    }\n\n}\n",
            "id": 6,
            "language": "Yul",
            "name": "#utility.yul"
        }
    ],
    "deployedGeneratedSources": [
        {
            "ast": {
                "nodeType": "YulBlock",
                "src": "0:15727:6",
                "statements": [
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "66:40:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "77:22:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "93:5:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mload",
                                            "nodeType": "YulIdentifier",
                                            "src": "87:5:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "87:12:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "length",
                                            "nodeType": "YulIdentifier",
                                            "src": "77:6:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "array_length_t_string_memory_ptr",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "49:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "length",
                                "nodeType": "YulTypedName",
                                "src": "59:6:6",
                                "type": ""
                            }
                        ],
                        "src": "7:99:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "208:73:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "225:3:6"
                                            },
                                            {
                                                "name": "length",
                                                "nodeType": "YulIdentifier",
                                                "src": "230:6:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "218:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "218:19:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "218:19:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "246:29:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "265:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "270:4:6",
                                                "type": "",
                                                "value": "0x20"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "261:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "261:14:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "updated_pos",
                                            "nodeType": "YulIdentifier",
                                            "src": "246:11:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "array_storeLengthForEncoding_t_string_memory_ptr_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "180:3:6",
                                "type": ""
                            },
                            {
                                "name": "length",
                                "nodeType": "YulTypedName",
                                "src": "185:6:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "updated_pos",
                                "nodeType": "YulTypedName",
                                "src": "196:11:6",
                                "type": ""
                            }
                        ],
                        "src": "112:169:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "349:184:6",
                            "statements": [
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "359:10:6",
                                    "value": {
                                        "kind": "number",
                                        "nodeType": "YulLiteral",
                                        "src": "368:1:6",
                                        "type": "",
                                        "value": "0"
                                    },
                                    "variables": [
                                        {
                                            "name": "i",
                                            "nodeType": "YulTypedName",
                                            "src": "363:1:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "428:63:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [
                                                        {
                                                            "arguments": [
                                                                {
                                                                    "name": "dst",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "453:3:6"
                                                                },
                                                                {
                                                                    "name": "i",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "458:1:6"
                                                                }
                                                            ],
                                                            "functionName": {
                                                                "name": "add",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "449:3:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "449:11:6"
                                                        },
                                                        {
                                                            "arguments": [
                                                                {
                                                                    "arguments": [
                                                                        {
                                                                            "name": "src",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "472:3:6"
                                                                        },
                                                                        {
                                                                            "name": "i",
                                                                            "nodeType": "YulIdentifier",
                                                                            "src": "477:1:6"
                                                                        }
                                                                    ],
                                                                    "functionName": {
                                                                        "name": "add",
                                                                        "nodeType": "YulIdentifier",
                                                                        "src": "468:3:6"
                                                                    },
                                                                    "nodeType": "YulFunctionCall",
                                                                    "src": "468:11:6"
                                                                }
                                                            ],
                                                            "functionName": {
                                                                "name": "mload",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "462:5:6"
                                                            },
                                                            "nodeType": "YulFunctionCall",
                                                            "src": "462:18:6"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "mstore",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "442:6:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "442:39:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "442:39:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "name": "i",
                                                "nodeType": "YulIdentifier",
                                                "src": "389:1:6"
                                            },
                                            {
                                                "name": "length",
                                                "nodeType": "YulIdentifier",
                                                "src": "392:6:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "lt",
                                            "nodeType": "YulIdentifier",
                                            "src": "386:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "386:13:6"
                                    },
                                    "nodeType": "YulForLoop",
                                    "post": {
                                        "nodeType": "YulBlock",
                                        "src": "400:19:6",
                                        "statements": [
                                            {
                                                "nodeType": "YulAssignment",
                                                "src": "402:15:6",
                                                "value": {
                                                    "arguments": [
                                                        {
                                                            "name": "i",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "411:1:6"
                                                        },
                                                        {
                                                            "kind": "number",
                                                            "nodeType": "YulLiteral",
                                                            "src": "414:2:6",
                                                            "type": "",
                                                            "value": "32"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "add",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "407:3:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "407:10:6"
                                                },
                                                "variableNames": [
                                                    {
                                                        "name": "i",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "402:1:6"
                                                    }
                                                ]
                                            }
                                        ]
                                    },
                                    "pre": {
                                        "nodeType": "YulBlock",
                                        "src": "382:3:6",
                                        "statements": []
                                    },
                                    "src": "378:113:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "dst",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "511:3:6"
                                                    },
                                                    {
                                                        "name": "length",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "516:6:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "507:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "507:16:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "525:1:6",
                                                "type": "",
                                                "value": "0"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "500:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "500:27:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "500:27:6"
                                }
                            ]
                        },
                        "name": "copy_memory_to_memory_with_cleanup",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "src",
                                "nodeType": "YulTypedName",
                                "src": "331:3:6",
                                "type": ""
                            },
                            {
                                "name": "dst",
                                "nodeType": "YulTypedName",
                                "src": "336:3:6",
                                "type": ""
                            },
                            {
                                "name": "length",
                                "nodeType": "YulTypedName",
                                "src": "341:6:6",
                                "type": ""
                            }
                        ],
                        "src": "287:246:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "587:54:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "597:38:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "value",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "615:5:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "622:2:6",
                                                        "type": "",
                                                        "value": "31"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "611:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "611:14:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "631:2:6",
                                                        "type": "",
                                                        "value": "31"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "not",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "627:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "627:7:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "and",
                                            "nodeType": "YulIdentifier",
                                            "src": "607:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "607:28:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "result",
                                            "nodeType": "YulIdentifier",
                                            "src": "597:6:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "round_up_to_mul_of_32",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "570:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "result",
                                "nodeType": "YulTypedName",
                                "src": "580:6:6",
                                "type": ""
                            }
                        ],
                        "src": "539:102:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "739:285:6",
                            "statements": [
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "749:53:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "796:5:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "array_length_t_string_memory_ptr",
                                            "nodeType": "YulIdentifier",
                                            "src": "763:32:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "763:39:6"
                                    },
                                    "variables": [
                                        {
                                            "name": "length",
                                            "nodeType": "YulTypedName",
                                            "src": "753:6:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "811:78:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "877:3:6"
                                            },
                                            {
                                                "name": "length",
                                                "nodeType": "YulIdentifier",
                                                "src": "882:6:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "array_storeLengthForEncoding_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "818:58:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "818:71:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "pos",
                                            "nodeType": "YulIdentifier",
                                            "src": "811:3:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "value",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "937:5:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "944:4:6",
                                                        "type": "",
                                                        "value": "0x20"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "933:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "933:16:6"
                                            },
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "951:3:6"
                                            },
                                            {
                                                "name": "length",
                                                "nodeType": "YulIdentifier",
                                                "src": "956:6:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "copy_memory_to_memory_with_cleanup",
                                            "nodeType": "YulIdentifier",
                                            "src": "898:34:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "898:65:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "898:65:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "972:46:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "983:3:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "length",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1010:6:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "round_up_to_mul_of_32",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "988:21:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "988:29:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "979:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "979:39:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "end",
                                            "nodeType": "YulIdentifier",
                                            "src": "972:3:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_t_string_memory_ptr_to_t_string_memory_ptr_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "720:5:6",
                                "type": ""
                            },
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "727:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "735:3:6",
                                "type": ""
                            }
                        ],
                        "src": "647:377:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "1148:195:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "1158:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "headStart",
                                                "nodeType": "YulIdentifier",
                                                "src": "1170:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "1181:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "1166:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1166:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "1158:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1205:9:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "1216:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "1201:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "1201:17:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "tail",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1224:4:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1230:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "1220:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "1220:20:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "1194:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1194:47:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "1194:47:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "1250:86:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "value0",
                                                "nodeType": "YulIdentifier",
                                                "src": "1322:6:6"
                                            },
                                            {
                                                "name": "tail",
                                                "nodeType": "YulIdentifier",
                                                "src": "1331:4:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_encode_t_string_memory_ptr_to_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "1258:63:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1258:78:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "1250:4:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_tuple_t_string_memory_ptr__to_t_string_memory_ptr__fromStack_reversed",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "1120:9:6",
                                "type": ""
                            },
                            {
                                "name": "value0",
                                "nodeType": "YulTypedName",
                                "src": "1132:6:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "tail",
                                "nodeType": "YulTypedName",
                                "src": "1143:4:6",
                                "type": ""
                            }
                        ],
                        "src": "1030:313:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "1389:35:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "1399:19:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "1415:2:6",
                                                "type": "",
                                                "value": "64"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mload",
                                            "nodeType": "YulIdentifier",
                                            "src": "1409:5:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1409:9:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "memPtr",
                                            "nodeType": "YulIdentifier",
                                            "src": "1399:6:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "allocate_unbounded",
                        "nodeType": "YulFunctionDefinition",
                        "returnVariables": [
                            {
                                "name": "memPtr",
                                "nodeType": "YulTypedName",
                                "src": "1382:6:6",
                                "type": ""
                            }
                        ],
                        "src": "1349:75:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "1519:28:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "1536:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "1539:1:6",
                                                "type": "",
                                                "value": "0"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "revert",
                                            "nodeType": "YulIdentifier",
                                            "src": "1529:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1529:12:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "1529:12:6"
                                }
                            ]
                        },
                        "name": "revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b",
                        "nodeType": "YulFunctionDefinition",
                        "src": "1430:117:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "1642:28:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "1659:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "1662:1:6",
                                                "type": "",
                                                "value": "0"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "revert",
                                            "nodeType": "YulIdentifier",
                                            "src": "1652:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1652:12:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "1652:12:6"
                                }
                            ]
                        },
                        "name": "revert_error_c1322bf8034eace5e0b5c7295db60986aa89aae5e0ea0873e4689e076861a5db",
                        "nodeType": "YulFunctionDefinition",
                        "src": "1553:117:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "1721:81:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "1731:65:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "1746:5:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "1753:42:6",
                                                "type": "",
                                                "value": "0xffffffffffffffffffffffffffffffffffffffff"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "and",
                                            "nodeType": "YulIdentifier",
                                            "src": "1742:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1742:54:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "cleaned",
                                            "nodeType": "YulIdentifier",
                                            "src": "1731:7:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "cleanup_t_uint160",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "1703:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "cleaned",
                                "nodeType": "YulTypedName",
                                "src": "1713:7:6",
                                "type": ""
                            }
                        ],
                        "src": "1676:126:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "1853:51:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "1863:35:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "1892:5:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "cleanup_t_uint160",
                                            "nodeType": "YulIdentifier",
                                            "src": "1874:17:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1874:24:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "cleaned",
                                            "nodeType": "YulIdentifier",
                                            "src": "1863:7:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "cleanup_t_address",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "1835:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "cleaned",
                                "nodeType": "YulTypedName",
                                "src": "1845:7:6",
                                "type": ""
                            }
                        ],
                        "src": "1808:96:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "1953:79:6",
                            "statements": [
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "2010:16:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [
                                                        {
                                                            "kind": "number",
                                                            "nodeType": "YulLiteral",
                                                            "src": "2019:1:6",
                                                            "type": "",
                                                            "value": "0"
                                                        },
                                                        {
                                                            "kind": "number",
                                                            "nodeType": "YulLiteral",
                                                            "src": "2022:1:6",
                                                            "type": "",
                                                            "value": "0"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "revert",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2012:6:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "2012:12:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "2012:12:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "value",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "1976:5:6"
                                                    },
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "value",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "2001:5:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "cleanup_t_address",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "1983:17:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "1983:24:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "eq",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "1973:2:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "1973:35:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "iszero",
                                            "nodeType": "YulIdentifier",
                                            "src": "1966:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "1966:43:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "1963:63:6"
                                }
                            ]
                        },
                        "name": "validator_revert_t_address",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "1946:5:6",
                                "type": ""
                            }
                        ],
                        "src": "1910:122:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "2090:87:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "2100:29:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "offset",
                                                "nodeType": "YulIdentifier",
                                                "src": "2122:6:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "calldataload",
                                            "nodeType": "YulIdentifier",
                                            "src": "2109:12:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2109:20:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "value",
                                            "nodeType": "YulIdentifier",
                                            "src": "2100:5:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "2165:5:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "validator_revert_t_address",
                                            "nodeType": "YulIdentifier",
                                            "src": "2138:26:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2138:33:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "2138:33:6"
                                }
                            ]
                        },
                        "name": "abi_decode_t_address",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "offset",
                                "nodeType": "YulTypedName",
                                "src": "2068:6:6",
                                "type": ""
                            },
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "2076:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "2084:5:6",
                                "type": ""
                            }
                        ],
                        "src": "2038:139:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "2228:32:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "2238:16:6",
                                    "value": {
                                        "name": "value",
                                        "nodeType": "YulIdentifier",
                                        "src": "2249:5:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "cleaned",
                                            "nodeType": "YulIdentifier",
                                            "src": "2238:7:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "cleanup_t_uint256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "2210:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "cleaned",
                                "nodeType": "YulTypedName",
                                "src": "2220:7:6",
                                "type": ""
                            }
                        ],
                        "src": "2183:77:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "2309:79:6",
                            "statements": [
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "2366:16:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [
                                                        {
                                                            "kind": "number",
                                                            "nodeType": "YulLiteral",
                                                            "src": "2375:1:6",
                                                            "type": "",
                                                            "value": "0"
                                                        },
                                                        {
                                                            "kind": "number",
                                                            "nodeType": "YulLiteral",
                                                            "src": "2378:1:6",
                                                            "type": "",
                                                            "value": "0"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "revert",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2368:6:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "2368:12:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "2368:12:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "value",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2332:5:6"
                                                    },
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "value",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "2357:5:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "cleanup_t_uint256",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "2339:17:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "2339:24:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "eq",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "2329:2:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "2329:35:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "iszero",
                                            "nodeType": "YulIdentifier",
                                            "src": "2322:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2322:43:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "2319:63:6"
                                }
                            ]
                        },
                        "name": "validator_revert_t_uint256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "2302:5:6",
                                "type": ""
                            }
                        ],
                        "src": "2266:122:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "2446:87:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "2456:29:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "offset",
                                                "nodeType": "YulIdentifier",
                                                "src": "2478:6:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "calldataload",
                                            "nodeType": "YulIdentifier",
                                            "src": "2465:12:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2465:20:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "value",
                                            "nodeType": "YulIdentifier",
                                            "src": "2456:5:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "2521:5:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "validator_revert_t_uint256",
                                            "nodeType": "YulIdentifier",
                                            "src": "2494:26:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2494:33:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "2494:33:6"
                                }
                            ]
                        },
                        "name": "abi_decode_t_uint256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "offset",
                                "nodeType": "YulTypedName",
                                "src": "2424:6:6",
                                "type": ""
                            },
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "2432:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "2440:5:6",
                                "type": ""
                            }
                        ],
                        "src": "2394:139:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "2622:391:6",
                            "statements": [
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "2668:83:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2670:77:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "2670:79:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "2670:79:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2643:7:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2652:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "2639:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "2639:23:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "2664:2:6",
                                                "type": "",
                                                "value": "64"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "slt",
                                            "nodeType": "YulIdentifier",
                                            "src": "2635:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "2635:32:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "2632:119:6"
                                },
                                {
                                    "nodeType": "YulBlock",
                                    "src": "2761:117:6",
                                    "statements": [
                                        {
                                            "nodeType": "YulVariableDeclaration",
                                            "src": "2776:15:6",
                                            "value": {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "2790:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            "variables": [
                                                {
                                                    "name": "offset",
                                                    "nodeType": "YulTypedName",
                                                    "src": "2780:6:6",
                                                    "type": ""
                                                }
                                            ]
                                        },
                                        {
                                            "nodeType": "YulAssignment",
                                            "src": "2805:63:6",
                                            "value": {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "headStart",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "2840:9:6"
                                                            },
                                                            {
                                                                "name": "offset",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "2851:6:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "add",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "2836:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "2836:22:6"
                                                    },
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2860:7:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "abi_decode_t_address",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "2815:20:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "2815:53:6"
                                            },
                                            "variableNames": [
                                                {
                                                    "name": "value0",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "2805:6:6"
                                                }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulBlock",
                                    "src": "2888:118:6",
                                    "statements": [
                                        {
                                            "nodeType": "YulVariableDeclaration",
                                            "src": "2903:16:6",
                                            "value": {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "2917:2:6",
                                                "type": "",
                                                "value": "32"
                                            },
                                            "variables": [
                                                {
                                                    "name": "offset",
                                                    "nodeType": "YulTypedName",
                                                    "src": "2907:6:6",
                                                    "type": ""
                                                }
                                            ]
                                        },
                                        {
                                            "nodeType": "YulAssignment",
                                            "src": "2933:63:6",
                                            "value": {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "headStart",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "2968:9:6"
                                                            },
                                                            {
                                                                "name": "offset",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "2979:6:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "add",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "2964:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "2964:22:6"
                                                    },
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "2988:7:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "abi_decode_t_uint256",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "2943:20:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "2943:53:6"
                                            },
                                            "variableNames": [
                                                {
                                                    "name": "value1",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "2933:6:6"
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_decode_tuple_t_addresst_uint256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "2584:9:6",
                                "type": ""
                            },
                            {
                                "name": "dataEnd",
                                "nodeType": "YulTypedName",
                                "src": "2595:7:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "value0",
                                "nodeType": "YulTypedName",
                                "src": "2607:6:6",
                                "type": ""
                            },
                            {
                                "name": "value1",
                                "nodeType": "YulTypedName",
                                "src": "2615:6:6",
                                "type": ""
                            }
                        ],
                        "src": "2539:474:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "3061:48:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "3071:32:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "value",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "3096:5:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "iszero",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "3089:6:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "3089:13:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "iszero",
                                            "nodeType": "YulIdentifier",
                                            "src": "3082:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3082:21:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "cleaned",
                                            "nodeType": "YulIdentifier",
                                            "src": "3071:7:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "cleanup_t_bool",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "3043:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "cleaned",
                                "nodeType": "YulTypedName",
                                "src": "3053:7:6",
                                "type": ""
                            }
                        ],
                        "src": "3019:90:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "3174:50:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "3191:3:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "value",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "3211:5:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "cleanup_t_bool",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "3196:14:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "3196:21:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "3184:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3184:34:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "3184:34:6"
                                }
                            ]
                        },
                        "name": "abi_encode_t_bool_to_t_bool_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "3162:5:6",
                                "type": ""
                            },
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "3169:3:6",
                                "type": ""
                            }
                        ],
                        "src": "3115:109:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "3322:118:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "3332:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "headStart",
                                                "nodeType": "YulIdentifier",
                                                "src": "3344:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "3355:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "3340:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3340:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "3332:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "value0",
                                                "nodeType": "YulIdentifier",
                                                "src": "3406:6:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "3419:9:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "3430:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "3415:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "3415:17:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_encode_t_bool_to_t_bool_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "3368:37:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3368:65:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "3368:65:6"
                                }
                            ]
                        },
                        "name": "abi_encode_tuple_t_bool__to_t_bool__fromStack_reversed",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "3294:9:6",
                                "type": ""
                            },
                            {
                                "name": "value0",
                                "nodeType": "YulTypedName",
                                "src": "3306:6:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "tail",
                                "nodeType": "YulTypedName",
                                "src": "3317:4:6",
                                "type": ""
                            }
                        ],
                        "src": "3230:210:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "3511:53:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "3528:3:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "value",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "3551:5:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "cleanup_t_uint256",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "3533:17:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "3533:24:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "3521:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3521:37:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "3521:37:6"
                                }
                            ]
                        },
                        "name": "abi_encode_t_uint256_to_t_uint256_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "3499:5:6",
                                "type": ""
                            },
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "3506:3:6",
                                "type": ""
                            }
                        ],
                        "src": "3446:118:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "3668:124:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "3678:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "headStart",
                                                "nodeType": "YulIdentifier",
                                                "src": "3690:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "3701:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "3686:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3686:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "3678:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "value0",
                                                "nodeType": "YulIdentifier",
                                                "src": "3758:6:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "3771:9:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "3782:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "3767:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "3767:17:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_encode_t_uint256_to_t_uint256_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "3714:43:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3714:71:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "3714:71:6"
                                }
                            ]
                        },
                        "name": "abi_encode_tuple_t_uint256__to_t_uint256__fromStack_reversed",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "3640:9:6",
                                "type": ""
                            },
                            {
                                "name": "value0",
                                "nodeType": "YulTypedName",
                                "src": "3652:6:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "tail",
                                "nodeType": "YulTypedName",
                                "src": "3663:4:6",
                                "type": ""
                            }
                        ],
                        "src": "3570:222:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "3898:519:6",
                            "statements": [
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "3944:83:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "3946:77:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "3946:79:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "3946:79:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "3919:7:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "3928:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "3915:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "3915:23:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "3940:2:6",
                                                "type": "",
                                                "value": "96"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "slt",
                                            "nodeType": "YulIdentifier",
                                            "src": "3911:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "3911:32:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "3908:119:6"
                                },
                                {
                                    "nodeType": "YulBlock",
                                    "src": "4037:117:6",
                                    "statements": [
                                        {
                                            "nodeType": "YulVariableDeclaration",
                                            "src": "4052:15:6",
                                            "value": {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "4066:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            "variables": [
                                                {
                                                    "name": "offset",
                                                    "nodeType": "YulTypedName",
                                                    "src": "4056:6:6",
                                                    "type": ""
                                                }
                                            ]
                                        },
                                        {
                                            "nodeType": "YulAssignment",
                                            "src": "4081:63:6",
                                            "value": {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "headStart",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "4116:9:6"
                                                            },
                                                            {
                                                                "name": "offset",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "4127:6:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "add",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "4112:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "4112:22:6"
                                                    },
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4136:7:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "abi_decode_t_address",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "4091:20:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "4091:53:6"
                                            },
                                            "variableNames": [
                                                {
                                                    "name": "value0",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "4081:6:6"
                                                }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulBlock",
                                    "src": "4164:118:6",
                                    "statements": [
                                        {
                                            "nodeType": "YulVariableDeclaration",
                                            "src": "4179:16:6",
                                            "value": {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "4193:2:6",
                                                "type": "",
                                                "value": "32"
                                            },
                                            "variables": [
                                                {
                                                    "name": "offset",
                                                    "nodeType": "YulTypedName",
                                                    "src": "4183:6:6",
                                                    "type": ""
                                                }
                                            ]
                                        },
                                        {
                                            "nodeType": "YulAssignment",
                                            "src": "4209:63:6",
                                            "value": {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "headStart",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "4244:9:6"
                                                            },
                                                            {
                                                                "name": "offset",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "4255:6:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "add",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "4240:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "4240:22:6"
                                                    },
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4264:7:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "abi_decode_t_address",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "4219:20:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "4219:53:6"
                                            },
                                            "variableNames": [
                                                {
                                                    "name": "value1",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "4209:6:6"
                                                }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulBlock",
                                    "src": "4292:118:6",
                                    "statements": [
                                        {
                                            "nodeType": "YulVariableDeclaration",
                                            "src": "4307:16:6",
                                            "value": {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "4321:2:6",
                                                "type": "",
                                                "value": "64"
                                            },
                                            "variables": [
                                                {
                                                    "name": "offset",
                                                    "nodeType": "YulTypedName",
                                                    "src": "4311:6:6",
                                                    "type": ""
                                                }
                                            ]
                                        },
                                        {
                                            "nodeType": "YulAssignment",
                                            "src": "4337:63:6",
                                            "value": {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "headStart",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "4372:9:6"
                                                            },
                                                            {
                                                                "name": "offset",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "4383:6:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "add",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "4368:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "4368:22:6"
                                                    },
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4392:7:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "abi_decode_t_uint256",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "4347:20:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "4347:53:6"
                                            },
                                            "variableNames": [
                                                {
                                                    "name": "value2",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "4337:6:6"
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_decode_tuple_t_addresst_addresst_uint256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "3852:9:6",
                                "type": ""
                            },
                            {
                                "name": "dataEnd",
                                "nodeType": "YulTypedName",
                                "src": "3863:7:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "value0",
                                "nodeType": "YulTypedName",
                                "src": "3875:6:6",
                                "type": ""
                            },
                            {
                                "name": "value1",
                                "nodeType": "YulTypedName",
                                "src": "3883:6:6",
                                "type": ""
                            },
                            {
                                "name": "value2",
                                "nodeType": "YulTypedName",
                                "src": "3891:6:6",
                                "type": ""
                            }
                        ],
                        "src": "3798:619:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "4466:43:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "4476:27:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "4491:5:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "4498:4:6",
                                                "type": "",
                                                "value": "0xff"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "and",
                                            "nodeType": "YulIdentifier",
                                            "src": "4487:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4487:16:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "cleaned",
                                            "nodeType": "YulIdentifier",
                                            "src": "4476:7:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "cleanup_t_uint8",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "4448:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "cleaned",
                                "nodeType": "YulTypedName",
                                "src": "4458:7:6",
                                "type": ""
                            }
                        ],
                        "src": "4423:86:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "4576:51:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "4593:3:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "value",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4614:5:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "cleanup_t_uint8",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "4598:15:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "4598:22:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "4586:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4586:35:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "4586:35:6"
                                }
                            ]
                        },
                        "name": "abi_encode_t_uint8_to_t_uint8_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "4564:5:6",
                                "type": ""
                            },
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "4571:3:6",
                                "type": ""
                            }
                        ],
                        "src": "4515:112:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "4727:120:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "4737:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "headStart",
                                                "nodeType": "YulIdentifier",
                                                "src": "4749:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "4760:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "4745:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4745:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "4737:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "value0",
                                                "nodeType": "YulIdentifier",
                                                "src": "4813:6:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4826:9:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "4837:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "4822:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "4822:17:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_encode_t_uint8_to_t_uint8_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "4773:39:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4773:67:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "4773:67:6"
                                }
                            ]
                        },
                        "name": "abi_encode_tuple_t_uint8__to_t_uint8__fromStack_reversed",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "4699:9:6",
                                "type": ""
                            },
                            {
                                "name": "value0",
                                "nodeType": "YulTypedName",
                                "src": "4711:6:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "tail",
                                "nodeType": "YulTypedName",
                                "src": "4722:4:6",
                                "type": ""
                            }
                        ],
                        "src": "4633:214:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "4919:263:6",
                            "statements": [
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "4965:83:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4967:77:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "4967:79:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "4967:79:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4940:7:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "4949:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "4936:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "4936:23:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "4961:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "slt",
                                            "nodeType": "YulIdentifier",
                                            "src": "4932:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "4932:32:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "4929:119:6"
                                },
                                {
                                    "nodeType": "YulBlock",
                                    "src": "5058:117:6",
                                    "statements": [
                                        {
                                            "nodeType": "YulVariableDeclaration",
                                            "src": "5073:15:6",
                                            "value": {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "5087:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            "variables": [
                                                {
                                                    "name": "offset",
                                                    "nodeType": "YulTypedName",
                                                    "src": "5077:6:6",
                                                    "type": ""
                                                }
                                            ]
                                        },
                                        {
                                            "nodeType": "YulAssignment",
                                            "src": "5102:63:6",
                                            "value": {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "headStart",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "5137:9:6"
                                                            },
                                                            {
                                                                "name": "offset",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "5148:6:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "add",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "5133:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "5133:22:6"
                                                    },
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "5157:7:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "abi_decode_t_address",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "5112:20:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "5112:53:6"
                                            },
                                            "variableNames": [
                                                {
                                                    "name": "value0",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "5102:6:6"
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_decode_tuple_t_address",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "4889:9:6",
                                "type": ""
                            },
                            {
                                "name": "dataEnd",
                                "nodeType": "YulTypedName",
                                "src": "4900:7:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "value0",
                                "nodeType": "YulTypedName",
                                "src": "4912:6:6",
                                "type": ""
                            }
                        ],
                        "src": "4853:329:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "5253:53:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "5270:3:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "value",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "5293:5:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "cleanup_t_address",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "5275:17:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "5275:24:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "5263:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "5263:37:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "5263:37:6"
                                }
                            ]
                        },
                        "name": "abi_encode_t_address_to_t_address_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "5241:5:6",
                                "type": ""
                            },
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "5248:3:6",
                                "type": ""
                            }
                        ],
                        "src": "5188:118:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "5410:124:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "5420:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "headStart",
                                                "nodeType": "YulIdentifier",
                                                "src": "5432:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "5443:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "5428:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "5428:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "5420:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "value0",
                                                "nodeType": "YulIdentifier",
                                                "src": "5500:6:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "5513:9:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "5524:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "5509:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "5509:17:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_encode_t_address_to_t_address_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "5456:43:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "5456:71:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "5456:71:6"
                                }
                            ]
                        },
                        "name": "abi_encode_tuple_t_address__to_t_address__fromStack_reversed",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "5382:9:6",
                                "type": ""
                            },
                            {
                                "name": "value0",
                                "nodeType": "YulTypedName",
                                "src": "5394:6:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "tail",
                                "nodeType": "YulTypedName",
                                "src": "5405:4:6",
                                "type": ""
                            }
                        ],
                        "src": "5312:222:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "5623:391:6",
                            "statements": [
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "5669:83:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "5671:77:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "5671:79:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "5671:79:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "5644:7:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "5653:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "5640:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "5640:23:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "5665:2:6",
                                                "type": "",
                                                "value": "64"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "slt",
                                            "nodeType": "YulIdentifier",
                                            "src": "5636:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "5636:32:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "5633:119:6"
                                },
                                {
                                    "nodeType": "YulBlock",
                                    "src": "5762:117:6",
                                    "statements": [
                                        {
                                            "nodeType": "YulVariableDeclaration",
                                            "src": "5777:15:6",
                                            "value": {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "5791:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            "variables": [
                                                {
                                                    "name": "offset",
                                                    "nodeType": "YulTypedName",
                                                    "src": "5781:6:6",
                                                    "type": ""
                                                }
                                            ]
                                        },
                                        {
                                            "nodeType": "YulAssignment",
                                            "src": "5806:63:6",
                                            "value": {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "headStart",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "5841:9:6"
                                                            },
                                                            {
                                                                "name": "offset",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "5852:6:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "add",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "5837:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "5837:22:6"
                                                    },
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "5861:7:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "abi_decode_t_address",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "5816:20:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "5816:53:6"
                                            },
                                            "variableNames": [
                                                {
                                                    "name": "value0",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "5806:6:6"
                                                }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulBlock",
                                    "src": "5889:118:6",
                                    "statements": [
                                        {
                                            "nodeType": "YulVariableDeclaration",
                                            "src": "5904:16:6",
                                            "value": {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "5918:2:6",
                                                "type": "",
                                                "value": "32"
                                            },
                                            "variables": [
                                                {
                                                    "name": "offset",
                                                    "nodeType": "YulTypedName",
                                                    "src": "5908:6:6",
                                                    "type": ""
                                                }
                                            ]
                                        },
                                        {
                                            "nodeType": "YulAssignment",
                                            "src": "5934:63:6",
                                            "value": {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "headStart",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "5969:9:6"
                                                            },
                                                            {
                                                                "name": "offset",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "5980:6:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "add",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "5965:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "5965:22:6"
                                                    },
                                                    {
                                                        "name": "dataEnd",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "5989:7:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "abi_decode_t_address",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "5944:20:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "5944:53:6"
                                            },
                                            "variableNames": [
                                                {
                                                    "name": "value1",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "5934:6:6"
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_decode_tuple_t_addresst_address",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "5585:9:6",
                                "type": ""
                            },
                            {
                                "name": "dataEnd",
                                "nodeType": "YulTypedName",
                                "src": "5596:7:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "value0",
                                "nodeType": "YulTypedName",
                                "src": "5608:6:6",
                                "type": ""
                            },
                            {
                                "name": "value1",
                                "nodeType": "YulTypedName",
                                "src": "5616:6:6",
                                "type": ""
                            }
                        ],
                        "src": "5540:474:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "6048:152:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6065:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6068:77:6",
                                                "type": "",
                                                "value": "35408467139433450592217433187231851964531694900788300625387963629091585785856"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "6058:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6058:88:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "6058:88:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6162:1:6",
                                                "type": "",
                                                "value": "4"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6165:4:6",
                                                "type": "",
                                                "value": "0x22"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "6155:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6155:15:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "6155:15:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6186:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6189:4:6",
                                                "type": "",
                                                "value": "0x24"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "revert",
                                            "nodeType": "YulIdentifier",
                                            "src": "6179:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6179:15:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "6179:15:6"
                                }
                            ]
                        },
                        "name": "panic_error_0x22",
                        "nodeType": "YulFunctionDefinition",
                        "src": "6020:180:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "6257:269:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "6267:22:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "data",
                                                "nodeType": "YulIdentifier",
                                                "src": "6281:4:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6287:1:6",
                                                "type": "",
                                                "value": "2"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "div",
                                            "nodeType": "YulIdentifier",
                                            "src": "6277:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6277:12:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "length",
                                            "nodeType": "YulIdentifier",
                                            "src": "6267:6:6"
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulVariableDeclaration",
                                    "src": "6298:38:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "data",
                                                "nodeType": "YulIdentifier",
                                                "src": "6328:4:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6334:1:6",
                                                "type": "",
                                                "value": "1"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "and",
                                            "nodeType": "YulIdentifier",
                                            "src": "6324:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6324:12:6"
                                    },
                                    "variables": [
                                        {
                                            "name": "outOfPlaceEncoding",
                                            "nodeType": "YulTypedName",
                                            "src": "6302:18:6",
                                            "type": ""
                                        }
                                    ]
                                },
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "6375:51:6",
                                        "statements": [
                                            {
                                                "nodeType": "YulAssignment",
                                                "src": "6389:27:6",
                                                "value": {
                                                    "arguments": [
                                                        {
                                                            "name": "length",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "6403:6:6"
                                                        },
                                                        {
                                                            "kind": "number",
                                                            "nodeType": "YulLiteral",
                                                            "src": "6411:4:6",
                                                            "type": "",
                                                            "value": "0x7f"
                                                        }
                                                    ],
                                                    "functionName": {
                                                        "name": "and",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "6399:3:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "6399:17:6"
                                                },
                                                "variableNames": [
                                                    {
                                                        "name": "length",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "6389:6:6"
                                                    }
                                                ]
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "name": "outOfPlaceEncoding",
                                                "nodeType": "YulIdentifier",
                                                "src": "6355:18:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "iszero",
                                            "nodeType": "YulIdentifier",
                                            "src": "6348:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6348:26:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "6345:81:6"
                                },
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "6478:42:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "panic_error_0x22",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "6492:16:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "6492:18:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "6492:18:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "name": "outOfPlaceEncoding",
                                                "nodeType": "YulIdentifier",
                                                "src": "6442:18:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "length",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "6465:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "6473:2:6",
                                                        "type": "",
                                                        "value": "32"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "lt",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "6462:2:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "6462:14:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "eq",
                                            "nodeType": "YulIdentifier",
                                            "src": "6439:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6439:38:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "6436:84:6"
                                }
                            ]
                        },
                        "name": "extract_byte_array_length",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "data",
                                "nodeType": "YulTypedName",
                                "src": "6241:4:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "length",
                                "nodeType": "YulTypedName",
                                "src": "6250:6:6",
                                "type": ""
                            }
                        ],
                        "src": "6206:320:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "6560:152:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6577:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6580:77:6",
                                                "type": "",
                                                "value": "35408467139433450592217433187231851964531694900788300625387963629091585785856"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "6570:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6570:88:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "6570:88:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6674:1:6",
                                                "type": "",
                                                "value": "4"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6677:4:6",
                                                "type": "",
                                                "value": "0x11"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "6667:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6667:15:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "6667:15:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6698:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "6701:4:6",
                                                "type": "",
                                                "value": "0x24"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "revert",
                                            "nodeType": "YulIdentifier",
                                            "src": "6691:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6691:15:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "6691:15:6"
                                }
                            ]
                        },
                        "name": "panic_error_0x11",
                        "nodeType": "YulFunctionDefinition",
                        "src": "6532:180:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "6762:147:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "6772:25:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "x",
                                                "nodeType": "YulIdentifier",
                                                "src": "6795:1:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "cleanup_t_uint256",
                                            "nodeType": "YulIdentifier",
                                            "src": "6777:17:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6777:20:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "x",
                                            "nodeType": "YulIdentifier",
                                            "src": "6772:1:6"
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "6806:25:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "y",
                                                "nodeType": "YulIdentifier",
                                                "src": "6829:1:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "cleanup_t_uint256",
                                            "nodeType": "YulIdentifier",
                                            "src": "6811:17:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6811:20:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "y",
                                            "nodeType": "YulIdentifier",
                                            "src": "6806:1:6"
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "6840:16:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "x",
                                                "nodeType": "YulIdentifier",
                                                "src": "6851:1:6"
                                            },
                                            {
                                                "name": "y",
                                                "nodeType": "YulIdentifier",
                                                "src": "6854:1:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "6847:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6847:9:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "sum",
                                            "nodeType": "YulIdentifier",
                                            "src": "6840:3:6"
                                        }
                                    ]
                                },
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "6880:22:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "panic_error_0x11",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "6882:16:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "6882:18:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "6882:18:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "name": "x",
                                                "nodeType": "YulIdentifier",
                                                "src": "6872:1:6"
                                            },
                                            {
                                                "name": "sum",
                                                "nodeType": "YulIdentifier",
                                                "src": "6875:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "gt",
                                            "nodeType": "YulIdentifier",
                                            "src": "6869:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "6869:10:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "6866:36:6"
                                }
                            ]
                        },
                        "name": "checked_add_t_uint256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "x",
                                "nodeType": "YulTypedName",
                                "src": "6749:1:6",
                                "type": ""
                            },
                            {
                                "name": "y",
                                "nodeType": "YulTypedName",
                                "src": "6752:1:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "sum",
                                "nodeType": "YulTypedName",
                                "src": "6758:3:6",
                                "type": ""
                            }
                        ],
                        "src": "6718:191:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "6959:32:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "6969:16:6",
                                    "value": {
                                        "name": "value",
                                        "nodeType": "YulIdentifier",
                                        "src": "6980:5:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "cleaned",
                                            "nodeType": "YulIdentifier",
                                            "src": "6969:7:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "cleanup_t_int256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "6941:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "cleaned",
                                "nodeType": "YulTypedName",
                                "src": "6951:7:6",
                                "type": ""
                            }
                        ],
                        "src": "6915:76:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "7041:328:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "7051:24:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "x",
                                                "nodeType": "YulIdentifier",
                                                "src": "7073:1:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "cleanup_t_int256",
                                            "nodeType": "YulIdentifier",
                                            "src": "7056:16:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7056:19:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "x",
                                            "nodeType": "YulIdentifier",
                                            "src": "7051:1:6"
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "7084:24:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "y",
                                                "nodeType": "YulIdentifier",
                                                "src": "7106:1:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "cleanup_t_int256",
                                            "nodeType": "YulIdentifier",
                                            "src": "7089:16:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7089:19:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "y",
                                            "nodeType": "YulIdentifier",
                                            "src": "7084:1:6"
                                        }
                                    ]
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "7117:17:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "x",
                                                "nodeType": "YulIdentifier",
                                                "src": "7129:1:6"
                                            },
                                            {
                                                "name": "y",
                                                "nodeType": "YulIdentifier",
                                                "src": "7132:1:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "sub",
                                            "nodeType": "YulIdentifier",
                                            "src": "7125:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7125:9:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "diff",
                                            "nodeType": "YulIdentifier",
                                            "src": "7117:4:6"
                                        }
                                    ]
                                },
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "7340:22:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "panic_error_0x11",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "7342:16:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "7342:18:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "7342:18:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "arguments": [
                                                                    {
                                                                        "name": "y",
                                                                        "nodeType": "YulIdentifier",
                                                                        "src": "7266:1:6"
                                                                    },
                                                                    {
                                                                        "kind": "number",
                                                                        "nodeType": "YulLiteral",
                                                                        "src": "7269:1:6",
                                                                        "type": "",
                                                                        "value": "0"
                                                                    }
                                                                ],
                                                                "functionName": {
                                                                    "name": "slt",
                                                                    "nodeType": "YulIdentifier",
                                                                    "src": "7262:3:6"
                                                                },
                                                                "nodeType": "YulFunctionCall",
                                                                "src": "7262:9:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "iszero",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "7255:6:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "7255:17:6"
                                                    },
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "diff",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "7278:4:6"
                                                            },
                                                            {
                                                                "name": "x",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "7284:1:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "sgt",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "7274:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "7274:12:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "and",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "7251:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "7251:36:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "y",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "7309:1:6"
                                                            },
                                                            {
                                                                "kind": "number",
                                                                "nodeType": "YulLiteral",
                                                                "src": "7312:1:6",
                                                                "type": "",
                                                                "value": "0"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "slt",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "7305:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "7305:9:6"
                                                    },
                                                    {
                                                        "arguments": [
                                                            {
                                                                "name": "diff",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "7320:4:6"
                                                            },
                                                            {
                                                                "name": "x",
                                                                "nodeType": "YulIdentifier",
                                                                "src": "7326:1:6"
                                                            }
                                                        ],
                                                        "functionName": {
                                                            "name": "slt",
                                                            "nodeType": "YulIdentifier",
                                                            "src": "7316:3:6"
                                                        },
                                                        "nodeType": "YulFunctionCall",
                                                        "src": "7316:12:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "and",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "7301:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "7301:28:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "or",
                                            "nodeType": "YulIdentifier",
                                            "src": "7235:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7235:104:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "7232:130:6"
                                }
                            ]
                        },
                        "name": "checked_sub_t_int256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "x",
                                "nodeType": "YulTypedName",
                                "src": "7027:1:6",
                                "type": ""
                            },
                            {
                                "name": "y",
                                "nodeType": "YulTypedName",
                                "src": "7030:1:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "diff",
                                "nodeType": "YulTypedName",
                                "src": "7036:4:6",
                                "type": ""
                            }
                        ],
                        "src": "6997:372:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "7414:189:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "7424:32:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "7450:5:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "cleanup_t_int256",
                                            "nodeType": "YulIdentifier",
                                            "src": "7433:16:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7433:23:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "value",
                                            "nodeType": "YulIdentifier",
                                            "src": "7424:5:6"
                                        }
                                    ]
                                },
                                {
                                    "body": {
                                        "nodeType": "YulBlock",
                                        "src": "7546:22:6",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [],
                                                    "functionName": {
                                                        "name": "panic_error_0x11",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "7548:16:6"
                                                    },
                                                    "nodeType": "YulFunctionCall",
                                                    "src": "7548:18:6"
                                                },
                                                "nodeType": "YulExpressionStatement",
                                                "src": "7548:18:6"
                                            }
                                        ]
                                    },
                                    "condition": {
                                        "arguments": [
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "7471:5:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "7478:66:6",
                                                "type": "",
                                                "value": "0x8000000000000000000000000000000000000000000000000000000000000000"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "eq",
                                            "nodeType": "YulIdentifier",
                                            "src": "7468:2:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7468:77:6"
                                    },
                                    "nodeType": "YulIf",
                                    "src": "7465:103:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "7577:20:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "7588:1:6",
                                                "type": "",
                                                "value": "0"
                                            },
                                            {
                                                "name": "value",
                                                "nodeType": "YulIdentifier",
                                                "src": "7591:5:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "sub",
                                            "nodeType": "YulIdentifier",
                                            "src": "7584:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7584:13:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "ret",
                                            "nodeType": "YulIdentifier",
                                            "src": "7577:3:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "negate_t_int256",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "value",
                                "nodeType": "YulTypedName",
                                "src": "7400:5:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "ret",
                                "nodeType": "YulTypedName",
                                "src": "7410:3:6",
                                "type": ""
                            }
                        ],
                        "src": "7375:228:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "7715:118:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "7737:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "7745:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "7733:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "7733:14:6"
                                            },
                                            {
                                                "hexValue": "45524332303a2064656372656173656420616c6c6f77616e63652062656c6f77",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "7749:34:6",
                                                "type": "",
                                                "value": "ERC20: decreased allowance below"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "7726:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7726:58:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "7726:58:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "7805:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "7813:2:6",
                                                        "type": "",
                                                        "value": "32"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "7801:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "7801:15:6"
                                            },
                                            {
                                                "hexValue": "207a65726f",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "7818:7:6",
                                                "type": "",
                                                "value": " zero"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "7794:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "7794:32:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "7794:32:6"
                                }
                            ]
                        },
                        "name": "store_literal_in_memory_f8b476f7d28209d77d4a4ac1fe36b9f8259aa1bb6bddfa6e89de7e51615cf8a8",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "memPtr",
                                "nodeType": "YulTypedName",
                                "src": "7707:6:6",
                                "type": ""
                            }
                        ],
                        "src": "7609:224:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "7985:220:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "7995:74:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "8061:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "8066:2:6",
                                                "type": "",
                                                "value": "37"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "array_storeLengthForEncoding_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "8002:58:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "8002:67:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "pos",
                                            "nodeType": "YulIdentifier",
                                            "src": "7995:3:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "8167:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "store_literal_in_memory_f8b476f7d28209d77d4a4ac1fe36b9f8259aa1bb6bddfa6e89de7e51615cf8a8",
                                            "nodeType": "YulIdentifier",
                                            "src": "8078:88:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "8078:93:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "8078:93:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "8180:19:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "8191:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "8196:2:6",
                                                "type": "",
                                                "value": "64"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "8187:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "8187:12:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "end",
                                            "nodeType": "YulIdentifier",
                                            "src": "8180:3:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_t_stringliteral_f8b476f7d28209d77d4a4ac1fe36b9f8259aa1bb6bddfa6e89de7e51615cf8a8_to_t_string_memory_ptr_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "7973:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "7981:3:6",
                                "type": ""
                            }
                        ],
                        "src": "7839:366:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "8382:248:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "8392:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "headStart",
                                                "nodeType": "YulIdentifier",
                                                "src": "8404:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "8415:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "8400:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "8400:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "8392:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "8439:9:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "8450:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "8435:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "8435:17:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "tail",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "8458:4:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "8464:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "8454:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "8454:20:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "8428:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "8428:47:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "8428:47:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "8484:139:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "tail",
                                                "nodeType": "YulIdentifier",
                                                "src": "8618:4:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_encode_t_stringliteral_f8b476f7d28209d77d4a4ac1fe36b9f8259aa1bb6bddfa6e89de7e51615cf8a8_to_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "8492:124:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "8492:131:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "8484:4:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_tuple_t_stringliteral_f8b476f7d28209d77d4a4ac1fe36b9f8259aa1bb6bddfa6e89de7e51615cf8a8__to_t_string_memory_ptr__fromStack_reversed",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "8362:9:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "tail",
                                "nodeType": "YulTypedName",
                                "src": "8377:4:6",
                                "type": ""
                            }
                        ],
                        "src": "8211:419:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "8742:119:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "8764:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "8772:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "8760:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "8760:14:6"
                                            },
                                            {
                                                "hexValue": "4f776e61626c653a206e6577206f776e657220697320746865207a65726f2061",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "8776:34:6",
                                                "type": "",
                                                "value": "Ownable: new owner is the zero a"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "8753:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "8753:58:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "8753:58:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "8832:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "8840:2:6",
                                                        "type": "",
                                                        "value": "32"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "8828:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "8828:15:6"
                                            },
                                            {
                                                "hexValue": "646472657373",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "8845:8:6",
                                                "type": "",
                                                "value": "ddress"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "8821:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "8821:33:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "8821:33:6"
                                }
                            ]
                        },
                        "name": "store_literal_in_memory_245f15ff17f551913a7a18385165551503906a406f905ac1c2437281a7cd0cfe",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "memPtr",
                                "nodeType": "YulTypedName",
                                "src": "8734:6:6",
                                "type": ""
                            }
                        ],
                        "src": "8636:225:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "9013:220:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "9023:74:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "9089:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "9094:2:6",
                                                "type": "",
                                                "value": "38"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "array_storeLengthForEncoding_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "9030:58:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "9030:67:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "pos",
                                            "nodeType": "YulIdentifier",
                                            "src": "9023:3:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "9195:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "store_literal_in_memory_245f15ff17f551913a7a18385165551503906a406f905ac1c2437281a7cd0cfe",
                                            "nodeType": "YulIdentifier",
                                            "src": "9106:88:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "9106:93:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "9106:93:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "9208:19:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "9219:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "9224:2:6",
                                                "type": "",
                                                "value": "64"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "9215:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "9215:12:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "end",
                                            "nodeType": "YulIdentifier",
                                            "src": "9208:3:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_t_stringliteral_245f15ff17f551913a7a18385165551503906a406f905ac1c2437281a7cd0cfe_to_t_string_memory_ptr_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "9001:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "9009:3:6",
                                "type": ""
                            }
                        ],
                        "src": "8867:366:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "9410:248:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "9420:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "headStart",
                                                "nodeType": "YulIdentifier",
                                                "src": "9432:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "9443:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "9428:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "9428:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "9420:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "9467:9:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "9478:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "9463:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "9463:17:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "tail",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "9486:4:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "9492:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "9482:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "9482:20:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "9456:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "9456:47:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "9456:47:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "9512:139:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "tail",
                                                "nodeType": "YulIdentifier",
                                                "src": "9646:4:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_encode_t_stringliteral_245f15ff17f551913a7a18385165551503906a406f905ac1c2437281a7cd0cfe_to_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "9520:124:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "9520:131:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "9512:4:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_tuple_t_stringliteral_245f15ff17f551913a7a18385165551503906a406f905ac1c2437281a7cd0cfe__to_t_string_memory_ptr__fromStack_reversed",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "9390:9:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "tail",
                                "nodeType": "YulTypedName",
                                "src": "9405:4:6",
                                "type": ""
                            }
                        ],
                        "src": "9239:419:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "9770:117:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "9792:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "9800:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "9788:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "9788:14:6"
                                            },
                                            {
                                                "hexValue": "45524332303a20617070726f76652066726f6d20746865207a65726f20616464",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "9804:34:6",
                                                "type": "",
                                                "value": "ERC20: approve from the zero add"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "9781:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "9781:58:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "9781:58:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "9860:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "9868:2:6",
                                                        "type": "",
                                                        "value": "32"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "9856:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "9856:15:6"
                                            },
                                            {
                                                "hexValue": "72657373",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "9873:6:6",
                                                "type": "",
                                                "value": "ress"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "9849:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "9849:31:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "9849:31:6"
                                }
                            ]
                        },
                        "name": "store_literal_in_memory_c953f4879035ed60e766b34720f656aab5c697b141d924c283124ecedb91c208",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "memPtr",
                                "nodeType": "YulTypedName",
                                "src": "9762:6:6",
                                "type": ""
                            }
                        ],
                        "src": "9664:223:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "10039:220:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "10049:74:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "10115:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "10120:2:6",
                                                "type": "",
                                                "value": "36"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "array_storeLengthForEncoding_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "10056:58:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "10056:67:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "pos",
                                            "nodeType": "YulIdentifier",
                                            "src": "10049:3:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "10221:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "store_literal_in_memory_c953f4879035ed60e766b34720f656aab5c697b141d924c283124ecedb91c208",
                                            "nodeType": "YulIdentifier",
                                            "src": "10132:88:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "10132:93:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "10132:93:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "10234:19:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "10245:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "10250:2:6",
                                                "type": "",
                                                "value": "64"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "10241:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "10241:12:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "end",
                                            "nodeType": "YulIdentifier",
                                            "src": "10234:3:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_t_stringliteral_c953f4879035ed60e766b34720f656aab5c697b141d924c283124ecedb91c208_to_t_string_memory_ptr_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "10027:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "10035:3:6",
                                "type": ""
                            }
                        ],
                        "src": "9893:366:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "10436:248:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "10446:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "headStart",
                                                "nodeType": "YulIdentifier",
                                                "src": "10458:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "10469:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "10454:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "10454:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "10446:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "10493:9:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "10504:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "10489:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "10489:17:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "tail",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "10512:4:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "10518:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "10508:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "10508:20:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "10482:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "10482:47:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "10482:47:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "10538:139:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "tail",
                                                "nodeType": "YulIdentifier",
                                                "src": "10672:4:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_encode_t_stringliteral_c953f4879035ed60e766b34720f656aab5c697b141d924c283124ecedb91c208_to_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "10546:124:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "10546:131:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "10538:4:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_tuple_t_stringliteral_c953f4879035ed60e766b34720f656aab5c697b141d924c283124ecedb91c208__to_t_string_memory_ptr__fromStack_reversed",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "10416:9:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "tail",
                                "nodeType": "YulTypedName",
                                "src": "10431:4:6",
                                "type": ""
                            }
                        ],
                        "src": "10265:419:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "10796:115:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "10818:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "10826:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "10814:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "10814:14:6"
                                            },
                                            {
                                                "hexValue": "45524332303a20617070726f766520746f20746865207a65726f206164647265",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "10830:34:6",
                                                "type": "",
                                                "value": "ERC20: approve to the zero addre"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "10807:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "10807:58:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "10807:58:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "10886:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "10894:2:6",
                                                        "type": "",
                                                        "value": "32"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "10882:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "10882:15:6"
                                            },
                                            {
                                                "hexValue": "7373",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "10899:4:6",
                                                "type": "",
                                                "value": "ss"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "10875:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "10875:29:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "10875:29:6"
                                }
                            ]
                        },
                        "name": "store_literal_in_memory_24883cc5fe64ace9d0df1893501ecb93c77180f0ff69cca79affb3c316dc8029",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "memPtr",
                                "nodeType": "YulTypedName",
                                "src": "10788:6:6",
                                "type": ""
                            }
                        ],
                        "src": "10690:221:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "11063:220:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "11073:74:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "11139:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "11144:2:6",
                                                "type": "",
                                                "value": "34"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "array_storeLengthForEncoding_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "11080:58:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "11080:67:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "pos",
                                            "nodeType": "YulIdentifier",
                                            "src": "11073:3:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "11245:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "store_literal_in_memory_24883cc5fe64ace9d0df1893501ecb93c77180f0ff69cca79affb3c316dc8029",
                                            "nodeType": "YulIdentifier",
                                            "src": "11156:88:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "11156:93:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "11156:93:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "11258:19:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "11269:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "11274:2:6",
                                                "type": "",
                                                "value": "64"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "11265:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "11265:12:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "end",
                                            "nodeType": "YulIdentifier",
                                            "src": "11258:3:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_t_stringliteral_24883cc5fe64ace9d0df1893501ecb93c77180f0ff69cca79affb3c316dc8029_to_t_string_memory_ptr_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "11051:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "11059:3:6",
                                "type": ""
                            }
                        ],
                        "src": "10917:366:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "11460:248:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "11470:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "headStart",
                                                "nodeType": "YulIdentifier",
                                                "src": "11482:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "11493:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "11478:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "11478:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "11470:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "11517:9:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "11528:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "11513:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "11513:17:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "tail",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "11536:4:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "11542:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "11532:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "11532:20:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "11506:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "11506:47:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "11506:47:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "11562:139:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "tail",
                                                "nodeType": "YulIdentifier",
                                                "src": "11696:4:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_encode_t_stringliteral_24883cc5fe64ace9d0df1893501ecb93c77180f0ff69cca79affb3c316dc8029_to_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "11570:124:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "11570:131:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "11562:4:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_tuple_t_stringliteral_24883cc5fe64ace9d0df1893501ecb93c77180f0ff69cca79affb3c316dc8029__to_t_string_memory_ptr__fromStack_reversed",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "11440:9:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "tail",
                                "nodeType": "YulTypedName",
                                "src": "11455:4:6",
                                "type": ""
                            }
                        ],
                        "src": "11289:419:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "11820:76:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "11842:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "11850:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "11838:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "11838:14:6"
                                            },
                                            {
                                                "hexValue": "4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "11854:34:6",
                                                "type": "",
                                                "value": "Ownable: caller is not the owner"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "11831:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "11831:58:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "11831:58:6"
                                }
                            ]
                        },
                        "name": "store_literal_in_memory_9924ebdf1add33d25d4ef888e16131f0a5687b0580a36c21b5c301a6c462effe",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "memPtr",
                                "nodeType": "YulTypedName",
                                "src": "11812:6:6",
                                "type": ""
                            }
                        ],
                        "src": "11714:182:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "12048:220:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "12058:74:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "12124:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "12129:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "array_storeLengthForEncoding_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "12065:58:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "12065:67:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "pos",
                                            "nodeType": "YulIdentifier",
                                            "src": "12058:3:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "12230:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "store_literal_in_memory_9924ebdf1add33d25d4ef888e16131f0a5687b0580a36c21b5c301a6c462effe",
                                            "nodeType": "YulIdentifier",
                                            "src": "12141:88:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "12141:93:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "12141:93:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "12243:19:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "12254:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "12259:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "12250:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "12250:12:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "end",
                                            "nodeType": "YulIdentifier",
                                            "src": "12243:3:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_t_stringliteral_9924ebdf1add33d25d4ef888e16131f0a5687b0580a36c21b5c301a6c462effe_to_t_string_memory_ptr_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "12036:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "12044:3:6",
                                "type": ""
                            }
                        ],
                        "src": "11902:366:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "12445:248:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "12455:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "headStart",
                                                "nodeType": "YulIdentifier",
                                                "src": "12467:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "12478:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "12463:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "12463:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "12455:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "12502:9:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "12513:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "12498:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "12498:17:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "tail",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "12521:4:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "12527:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "12517:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "12517:20:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "12491:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "12491:47:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "12491:47:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "12547:139:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "tail",
                                                "nodeType": "YulIdentifier",
                                                "src": "12681:4:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_encode_t_stringliteral_9924ebdf1add33d25d4ef888e16131f0a5687b0580a36c21b5c301a6c462effe_to_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "12555:124:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "12555:131:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "12547:4:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_tuple_t_stringliteral_9924ebdf1add33d25d4ef888e16131f0a5687b0580a36c21b5c301a6c462effe__to_t_string_memory_ptr__fromStack_reversed",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "12425:9:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "tail",
                                "nodeType": "YulTypedName",
                                "src": "12440:4:6",
                                "type": ""
                            }
                        ],
                        "src": "12274:419:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "12805:75:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "12827:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "12835:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "12823:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "12823:14:6"
                                            },
                                            {
                                                "hexValue": "45524332303a206d696e7420746f20746865207a65726f2061646472657373",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "12839:33:6",
                                                "type": "",
                                                "value": "ERC20: mint to the zero address"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "12816:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "12816:57:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "12816:57:6"
                                }
                            ]
                        },
                        "name": "store_literal_in_memory_fc0b381caf0a47702017f3c4b358ebe3d3aff6c60ce819a8bf3ef5a95d4f202e",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "memPtr",
                                "nodeType": "YulTypedName",
                                "src": "12797:6:6",
                                "type": ""
                            }
                        ],
                        "src": "12699:181:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "13032:220:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "13042:74:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "13108:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "13113:2:6",
                                                "type": "",
                                                "value": "31"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "array_storeLengthForEncoding_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "13049:58:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "13049:67:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "pos",
                                            "nodeType": "YulIdentifier",
                                            "src": "13042:3:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "13214:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "store_literal_in_memory_fc0b381caf0a47702017f3c4b358ebe3d3aff6c60ce819a8bf3ef5a95d4f202e",
                                            "nodeType": "YulIdentifier",
                                            "src": "13125:88:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "13125:93:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "13125:93:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "13227:19:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "13238:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "13243:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "13234:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "13234:12:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "end",
                                            "nodeType": "YulIdentifier",
                                            "src": "13227:3:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_t_stringliteral_fc0b381caf0a47702017f3c4b358ebe3d3aff6c60ce819a8bf3ef5a95d4f202e_to_t_string_memory_ptr_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "13020:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "13028:3:6",
                                "type": ""
                            }
                        ],
                        "src": "12886:366:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "13429:248:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "13439:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "headStart",
                                                "nodeType": "YulIdentifier",
                                                "src": "13451:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "13462:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "13447:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "13447:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "13439:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "13486:9:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "13497:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "13482:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "13482:17:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "tail",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "13505:4:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "13511:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "13501:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "13501:20:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "13475:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "13475:47:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "13475:47:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "13531:139:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "tail",
                                                "nodeType": "YulIdentifier",
                                                "src": "13665:4:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_encode_t_stringliteral_fc0b381caf0a47702017f3c4b358ebe3d3aff6c60ce819a8bf3ef5a95d4f202e_to_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "13539:124:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "13539:131:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "13531:4:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_tuple_t_stringliteral_fc0b381caf0a47702017f3c4b358ebe3d3aff6c60ce819a8bf3ef5a95d4f202e__to_t_string_memory_ptr__fromStack_reversed",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "13409:9:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "tail",
                                "nodeType": "YulTypedName",
                                "src": "13424:4:6",
                                "type": ""
                            }
                        ],
                        "src": "13258:419:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "13789:114:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "13811:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "13819:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "13807:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "13807:14:6"
                                            },
                                            {
                                                "hexValue": "45524332303a206275726e2066726f6d20746865207a65726f20616464726573",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "13823:34:6",
                                                "type": "",
                                                "value": "ERC20: burn from the zero addres"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "13800:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "13800:58:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "13800:58:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "13879:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "13887:2:6",
                                                        "type": "",
                                                        "value": "32"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "13875:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "13875:15:6"
                                            },
                                            {
                                                "hexValue": "73",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "13892:3:6",
                                                "type": "",
                                                "value": "s"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "13868:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "13868:28:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "13868:28:6"
                                }
                            ]
                        },
                        "name": "store_literal_in_memory_b16788493b576042bb52c50ed56189e0b250db113c7bfb1c3897d25cf9632d7f",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "memPtr",
                                "nodeType": "YulTypedName",
                                "src": "13781:6:6",
                                "type": ""
                            }
                        ],
                        "src": "13683:220:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "14055:220:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "14065:74:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "14131:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "14136:2:6",
                                                "type": "",
                                                "value": "33"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "array_storeLengthForEncoding_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "14072:58:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "14072:67:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "pos",
                                            "nodeType": "YulIdentifier",
                                            "src": "14065:3:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "14237:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "store_literal_in_memory_b16788493b576042bb52c50ed56189e0b250db113c7bfb1c3897d25cf9632d7f",
                                            "nodeType": "YulIdentifier",
                                            "src": "14148:88:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "14148:93:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "14148:93:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "14250:19:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "14261:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "14266:2:6",
                                                "type": "",
                                                "value": "64"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "14257:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "14257:12:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "end",
                                            "nodeType": "YulIdentifier",
                                            "src": "14250:3:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_t_stringliteral_b16788493b576042bb52c50ed56189e0b250db113c7bfb1c3897d25cf9632d7f_to_t_string_memory_ptr_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "14043:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "14051:3:6",
                                "type": ""
                            }
                        ],
                        "src": "13909:366:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "14452:248:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "14462:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "headStart",
                                                "nodeType": "YulIdentifier",
                                                "src": "14474:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "14485:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "14470:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "14470:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "14462:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "14509:9:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "14520:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "14505:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "14505:17:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "tail",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "14528:4:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "14534:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "14524:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "14524:20:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "14498:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "14498:47:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "14498:47:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "14554:139:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "tail",
                                                "nodeType": "YulIdentifier",
                                                "src": "14688:4:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_encode_t_stringliteral_b16788493b576042bb52c50ed56189e0b250db113c7bfb1c3897d25cf9632d7f_to_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "14562:124:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "14562:131:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "14554:4:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_tuple_t_stringliteral_b16788493b576042bb52c50ed56189e0b250db113c7bfb1c3897d25cf9632d7f__to_t_string_memory_ptr__fromStack_reversed",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "14432:9:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "tail",
                                "nodeType": "YulTypedName",
                                "src": "14447:4:6",
                                "type": ""
                            }
                        ],
                        "src": "14281:419:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "14812:115:6",
                            "statements": [
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "14834:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "14842:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "14830:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "14830:14:6"
                                            },
                                            {
                                                "hexValue": "45524332303a206275726e20616d6f756e7420657863656564732062616c616e",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "14846:34:6",
                                                "type": "",
                                                "value": "ERC20: burn amount exceeds balan"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "14823:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "14823:58:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "14823:58:6"
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "memPtr",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "14902:6:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "14910:2:6",
                                                        "type": "",
                                                        "value": "32"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "14898:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "14898:15:6"
                                            },
                                            {
                                                "hexValue": "6365",
                                                "kind": "string",
                                                "nodeType": "YulLiteral",
                                                "src": "14915:4:6",
                                                "type": "",
                                                "value": "ce"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "14891:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "14891:29:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "14891:29:6"
                                }
                            ]
                        },
                        "name": "store_literal_in_memory_149b126e7125232b4200af45303d04fba8b74653b1a295a6a561a528c33fefdd",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "memPtr",
                                "nodeType": "YulTypedName",
                                "src": "14804:6:6",
                                "type": ""
                            }
                        ],
                        "src": "14706:221:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "15079:220:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "15089:74:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "15155:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "15160:2:6",
                                                "type": "",
                                                "value": "34"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "array_storeLengthForEncoding_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "15096:58:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "15096:67:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "pos",
                                            "nodeType": "YulIdentifier",
                                            "src": "15089:3:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "15261:3:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "store_literal_in_memory_149b126e7125232b4200af45303d04fba8b74653b1a295a6a561a528c33fefdd",
                                            "nodeType": "YulIdentifier",
                                            "src": "15172:88:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "15172:93:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "15172:93:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "15274:19:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "pos",
                                                "nodeType": "YulIdentifier",
                                                "src": "15285:3:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "15290:2:6",
                                                "type": "",
                                                "value": "64"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "15281:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "15281:12:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "end",
                                            "nodeType": "YulIdentifier",
                                            "src": "15274:3:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_t_stringliteral_149b126e7125232b4200af45303d04fba8b74653b1a295a6a561a528c33fefdd_to_t_string_memory_ptr_fromStack",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "pos",
                                "nodeType": "YulTypedName",
                                "src": "15067:3:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "end",
                                "nodeType": "YulTypedName",
                                "src": "15075:3:6",
                                "type": ""
                            }
                        ],
                        "src": "14933:366:6"
                    },
                    {
                        "body": {
                            "nodeType": "YulBlock",
                            "src": "15476:248:6",
                            "statements": [
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "15486:26:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "headStart",
                                                "nodeType": "YulIdentifier",
                                                "src": "15498:9:6"
                                            },
                                            {
                                                "kind": "number",
                                                "nodeType": "YulLiteral",
                                                "src": "15509:2:6",
                                                "type": "",
                                                "value": "32"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "add",
                                            "nodeType": "YulIdentifier",
                                            "src": "15494:3:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "15494:18:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "15486:4:6"
                                        }
                                    ]
                                },
                                {
                                    "expression": {
                                        "arguments": [
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "15533:9:6"
                                                    },
                                                    {
                                                        "kind": "number",
                                                        "nodeType": "YulLiteral",
                                                        "src": "15544:1:6",
                                                        "type": "",
                                                        "value": "0"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "add",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "15529:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "15529:17:6"
                                            },
                                            {
                                                "arguments": [
                                                    {
                                                        "name": "tail",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "15552:4:6"
                                                    },
                                                    {
                                                        "name": "headStart",
                                                        "nodeType": "YulIdentifier",
                                                        "src": "15558:9:6"
                                                    }
                                                ],
                                                "functionName": {
                                                    "name": "sub",
                                                    "nodeType": "YulIdentifier",
                                                    "src": "15548:3:6"
                                                },
                                                "nodeType": "YulFunctionCall",
                                                "src": "15548:20:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "mstore",
                                            "nodeType": "YulIdentifier",
                                            "src": "15522:6:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "15522:47:6"
                                    },
                                    "nodeType": "YulExpressionStatement",
                                    "src": "15522:47:6"
                                },
                                {
                                    "nodeType": "YulAssignment",
                                    "src": "15578:139:6",
                                    "value": {
                                        "arguments": [
                                            {
                                                "name": "tail",
                                                "nodeType": "YulIdentifier",
                                                "src": "15712:4:6"
                                            }
                                        ],
                                        "functionName": {
                                            "name": "abi_encode_t_stringliteral_149b126e7125232b4200af45303d04fba8b74653b1a295a6a561a528c33fefdd_to_t_string_memory_ptr_fromStack",
                                            "nodeType": "YulIdentifier",
                                            "src": "15586:124:6"
                                        },
                                        "nodeType": "YulFunctionCall",
                                        "src": "15586:131:6"
                                    },
                                    "variableNames": [
                                        {
                                            "name": "tail",
                                            "nodeType": "YulIdentifier",
                                            "src": "15578:4:6"
                                        }
                                    ]
                                }
                            ]
                        },
                        "name": "abi_encode_tuple_t_stringliteral_149b126e7125232b4200af45303d04fba8b74653b1a295a6a561a528c33fefdd__to_t_string_memory_ptr__fromStack_reversed",
                        "nodeType": "YulFunctionDefinition",
                        "parameters": [
                            {
                                "name": "headStart",
                                "nodeType": "YulTypedName",
                                "src": "15456:9:6",
                                "type": ""
                            }
                        ],
                        "returnVariables": [
                            {
                                "name": "tail",
                                "nodeType": "YulTypedName",
                                "src": "15471:4:6",
                                "type": ""
                            }
                        ],
                        "src": "15305:419:6"
                    }
                ]
            },
            "contents": "{\n\n    function array_length_t_string_memory_ptr(value) -> length {\n\n        length := mload(value)\n\n    }\n\n    function array_storeLengthForEncoding_t_string_memory_ptr_fromStack(pos, length) -> updated_pos {\n        mstore(pos, length)\n        updated_pos := add(pos, 0x20)\n    }\n\n    function copy_memory_to_memory_with_cleanup(src, dst, length) {\n        let i := 0\n        for { } lt(i, length) { i := add(i, 32) }\n        {\n            mstore(add(dst, i), mload(add(src, i)))\n        }\n        mstore(add(dst, length), 0)\n    }\n\n    function round_up_to_mul_of_32(value) -> result {\n        result := and(add(value, 31), not(31))\n    }\n\n    function abi_encode_t_string_memory_ptr_to_t_string_memory_ptr_fromStack(value, pos) -> end {\n        let length := array_length_t_string_memory_ptr(value)\n        pos := array_storeLengthForEncoding_t_string_memory_ptr_fromStack(pos, length)\n        copy_memory_to_memory_with_cleanup(add(value, 0x20), pos, length)\n        end := add(pos, round_up_to_mul_of_32(length))\n    }\n\n    function abi_encode_tuple_t_string_memory_ptr__to_t_string_memory_ptr__fromStack_reversed(headStart , value0) -> tail {\n        tail := add(headStart, 32)\n\n        mstore(add(headStart, 0), sub(tail, headStart))\n        tail := abi_encode_t_string_memory_ptr_to_t_string_memory_ptr_fromStack(value0,  tail)\n\n    }\n\n    function allocate_unbounded() -> memPtr {\n        memPtr := mload(64)\n    }\n\n    function revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b() {\n        revert(0, 0)\n    }\n\n    function revert_error_c1322bf8034eace5e0b5c7295db60986aa89aae5e0ea0873e4689e076861a5db() {\n        revert(0, 0)\n    }\n\n    function cleanup_t_uint160(value) -> cleaned {\n        cleaned := and(value, 0xffffffffffffffffffffffffffffffffffffffff)\n    }\n\n    function cleanup_t_address(value) -> cleaned {\n        cleaned := cleanup_t_uint160(value)\n    }\n\n    function validator_revert_t_address(value) {\n        if iszero(eq(value, cleanup_t_address(value))) { revert(0, 0) }\n    }\n\n    function abi_decode_t_address(offset, end) -> value {\n        value := calldataload(offset)\n        validator_revert_t_address(value)\n    }\n\n    function cleanup_t_uint256(value) -> cleaned {\n        cleaned := value\n    }\n\n    function validator_revert_t_uint256(value) {\n        if iszero(eq(value, cleanup_t_uint256(value))) { revert(0, 0) }\n    }\n\n    function abi_decode_t_uint256(offset, end) -> value {\n        value := calldataload(offset)\n        validator_revert_t_uint256(value)\n    }\n\n    function abi_decode_tuple_t_addresst_uint256(headStart, dataEnd) -> value0, value1 {\n        if slt(sub(dataEnd, headStart), 64) { revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b() }\n\n        {\n\n            let offset := 0\n\n            value0 := abi_decode_t_address(add(headStart, offset), dataEnd)\n        }\n\n        {\n\n            let offset := 32\n\n            value1 := abi_decode_t_uint256(add(headStart, offset), dataEnd)\n        }\n\n    }\n\n    function cleanup_t_bool(value) -> cleaned {\n        cleaned := iszero(iszero(value))\n    }\n\n    function abi_encode_t_bool_to_t_bool_fromStack(value, pos) {\n        mstore(pos, cleanup_t_bool(value))\n    }\n\n    function abi_encode_tuple_t_bool__to_t_bool__fromStack_reversed(headStart , value0) -> tail {\n        tail := add(headStart, 32)\n\n        abi_encode_t_bool_to_t_bool_fromStack(value0,  add(headStart, 0))\n\n    }\n\n    function abi_encode_t_uint256_to_t_uint256_fromStack(value, pos) {\n        mstore(pos, cleanup_t_uint256(value))\n    }\n\n    function abi_encode_tuple_t_uint256__to_t_uint256__fromStack_reversed(headStart , value0) -> tail {\n        tail := add(headStart, 32)\n\n        abi_encode_t_uint256_to_t_uint256_fromStack(value0,  add(headStart, 0))\n\n    }\n\n    function abi_decode_tuple_t_addresst_addresst_uint256(headStart, dataEnd) -> value0, value1, value2 {\n        if slt(sub(dataEnd, headStart), 96) { revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b() }\n\n        {\n\n            let offset := 0\n\n            value0 := abi_decode_t_address(add(headStart, offset), dataEnd)\n        }\n\n        {\n\n            let offset := 32\n\n            value1 := abi_decode_t_address(add(headStart, offset), dataEnd)\n        }\n\n        {\n\n            let offset := 64\n\n            value2 := abi_decode_t_uint256(add(headStart, offset), dataEnd)\n        }\n\n    }\n\n    function cleanup_t_uint8(value) -> cleaned {\n        cleaned := and(value, 0xff)\n    }\n\n    function abi_encode_t_uint8_to_t_uint8_fromStack(value, pos) {\n        mstore(pos, cleanup_t_uint8(value))\n    }\n\n    function abi_encode_tuple_t_uint8__to_t_uint8__fromStack_reversed(headStart , value0) -> tail {\n        tail := add(headStart, 32)\n\n        abi_encode_t_uint8_to_t_uint8_fromStack(value0,  add(headStart, 0))\n\n    }\n\n    function abi_decode_tuple_t_address(headStart, dataEnd) -> value0 {\n        if slt(sub(dataEnd, headStart), 32) { revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b() }\n\n        {\n\n            let offset := 0\n\n            value0 := abi_decode_t_address(add(headStart, offset), dataEnd)\n        }\n\n    }\n\n    function abi_encode_t_address_to_t_address_fromStack(value, pos) {\n        mstore(pos, cleanup_t_address(value))\n    }\n\n    function abi_encode_tuple_t_address__to_t_address__fromStack_reversed(headStart , value0) -> tail {\n        tail := add(headStart, 32)\n\n        abi_encode_t_address_to_t_address_fromStack(value0,  add(headStart, 0))\n\n    }\n\n    function abi_decode_tuple_t_addresst_address(headStart, dataEnd) -> value0, value1 {\n        if slt(sub(dataEnd, headStart), 64) { revert_error_dbdddcbe895c83990c08b3492a0e83918d802a52331272ac6fdb6a7c4aea3b1b() }\n\n        {\n\n            let offset := 0\n\n            value0 := abi_decode_t_address(add(headStart, offset), dataEnd)\n        }\n\n        {\n\n            let offset := 32\n\n            value1 := abi_decode_t_address(add(headStart, offset), dataEnd)\n        }\n\n    }\n\n    function panic_error_0x22() {\n        mstore(0, 35408467139433450592217433187231851964531694900788300625387963629091585785856)\n        mstore(4, 0x22)\n        revert(0, 0x24)\n    }\n\n    function extract_byte_array_length(data) -> length {\n        length := div(data, 2)\n        let outOfPlaceEncoding := and(data, 1)\n        if iszero(outOfPlaceEncoding) {\n            length := and(length, 0x7f)\n        }\n\n        if eq(outOfPlaceEncoding, lt(length, 32)) {\n            panic_error_0x22()\n        }\n    }\n\n    function panic_error_0x11() {\n        mstore(0, 35408467139433450592217433187231851964531694900788300625387963629091585785856)\n        mstore(4, 0x11)\n        revert(0, 0x24)\n    }\n\n    function checked_add_t_uint256(x, y) -> sum {\n        x := cleanup_t_uint256(x)\n        y := cleanup_t_uint256(y)\n        sum := add(x, y)\n\n        if gt(x, sum) { panic_error_0x11() }\n\n    }\n\n    function cleanup_t_int256(value) -> cleaned {\n        cleaned := value\n    }\n\n    function checked_sub_t_int256(x, y) -> diff {\n        x := cleanup_t_int256(x)\n        y := cleanup_t_int256(y)\n        diff := sub(x, y)\n\n        // underflow, if y >= 0 and diff > x\n        // overflow, if y < 0 and diff < x\n        if or(\n            and(iszero(slt(y, 0)), sgt(diff, x)),\n            and(slt(y, 0), slt(diff, x))\n        ) { panic_error_0x11() }\n\n    }\n\n    function negate_t_int256(value) -> ret {\n        value := cleanup_t_int256(value)\n        if eq(value, 0x8000000000000000000000000000000000000000000000000000000000000000) { panic_error_0x11() }\n        ret := sub(0, value)\n    }\n\n    function store_literal_in_memory_f8b476f7d28209d77d4a4ac1fe36b9f8259aa1bb6bddfa6e89de7e51615cf8a8(memPtr) {\n\n        mstore(add(memPtr, 0), \"ERC20: decreased allowance below\")\n\n        mstore(add(memPtr, 32), \" zero\")\n\n    }\n\n    function abi_encode_t_stringliteral_f8b476f7d28209d77d4a4ac1fe36b9f8259aa1bb6bddfa6e89de7e51615cf8a8_to_t_string_memory_ptr_fromStack(pos) -> end {\n        pos := array_storeLengthForEncoding_t_string_memory_ptr_fromStack(pos, 37)\n        store_literal_in_memory_f8b476f7d28209d77d4a4ac1fe36b9f8259aa1bb6bddfa6e89de7e51615cf8a8(pos)\n        end := add(pos, 64)\n    }\n\n    function abi_encode_tuple_t_stringliteral_f8b476f7d28209d77d4a4ac1fe36b9f8259aa1bb6bddfa6e89de7e51615cf8a8__to_t_string_memory_ptr__fromStack_reversed(headStart ) -> tail {\n        tail := add(headStart, 32)\n\n        mstore(add(headStart, 0), sub(tail, headStart))\n        tail := abi_encode_t_stringliteral_f8b476f7d28209d77d4a4ac1fe36b9f8259aa1bb6bddfa6e89de7e51615cf8a8_to_t_string_memory_ptr_fromStack( tail)\n\n    }\n\n    function store_literal_in_memory_245f15ff17f551913a7a18385165551503906a406f905ac1c2437281a7cd0cfe(memPtr) {\n\n        mstore(add(memPtr, 0), \"Ownable: new owner is the zero a\")\n\n        mstore(add(memPtr, 32), \"ddress\")\n\n    }\n\n    function abi_encode_t_stringliteral_245f15ff17f551913a7a18385165551503906a406f905ac1c2437281a7cd0cfe_to_t_string_memory_ptr_fromStack(pos) -> end {\n        pos := array_storeLengthForEncoding_t_string_memory_ptr_fromStack(pos, 38)\n        store_literal_in_memory_245f15ff17f551913a7a18385165551503906a406f905ac1c2437281a7cd0cfe(pos)\n        end := add(pos, 64)\n    }\n\n    function abi_encode_tuple_t_stringliteral_245f15ff17f551913a7a18385165551503906a406f905ac1c2437281a7cd0cfe__to_t_string_memory_ptr__fromStack_reversed(headStart ) -> tail {\n        tail := add(headStart, 32)\n\n        mstore(add(headStart, 0), sub(tail, headStart))\n        tail := abi_encode_t_stringliteral_245f15ff17f551913a7a18385165551503906a406f905ac1c2437281a7cd0cfe_to_t_string_memory_ptr_fromStack( tail)\n\n    }\n\n    function store_literal_in_memory_c953f4879035ed60e766b34720f656aab5c697b141d924c283124ecedb91c208(memPtr) {\n\n        mstore(add(memPtr, 0), \"ERC20: approve from the zero add\")\n\n        mstore(add(memPtr, 32), \"ress\")\n\n    }\n\n    function abi_encode_t_stringliteral_c953f4879035ed60e766b34720f656aab5c697b141d924c283124ecedb91c208_to_t_string_memory_ptr_fromStack(pos) -> end {\n        pos := array_storeLengthForEncoding_t_string_memory_ptr_fromStack(pos, 36)\n        store_literal_in_memory_c953f4879035ed60e766b34720f656aab5c697b141d924c283124ecedb91c208(pos)\n        end := add(pos, 64)\n    }\n\n    function abi_encode_tuple_t_stringliteral_c953f4879035ed60e766b34720f656aab5c697b141d924c283124ecedb91c208__to_t_string_memory_ptr__fromStack_reversed(headStart ) -> tail {\n        tail := add(headStart, 32)\n\n        mstore(add(headStart, 0), sub(tail, headStart))\n        tail := abi_encode_t_stringliteral_c953f4879035ed60e766b34720f656aab5c697b141d924c283124ecedb91c208_to_t_string_memory_ptr_fromStack( tail)\n\n    }\n\n    function store_literal_in_memory_24883cc5fe64ace9d0df1893501ecb93c77180f0ff69cca79affb3c316dc8029(memPtr) {\n\n        mstore(add(memPtr, 0), \"ERC20: approve to the zero addre\")\n\n        mstore(add(memPtr, 32), \"ss\")\n\n    }\n\n    function abi_encode_t_stringliteral_24883cc5fe64ace9d0df1893501ecb93c77180f0ff69cca79affb3c316dc8029_to_t_string_memory_ptr_fromStack(pos) -> end {\n        pos := array_storeLengthForEncoding_t_string_memory_ptr_fromStack(pos, 34)\n        store_literal_in_memory_24883cc5fe64ace9d0df1893501ecb93c77180f0ff69cca79affb3c316dc8029(pos)\n        end := add(pos, 64)\n    }\n\n    function abi_encode_tuple_t_stringliteral_24883cc5fe64ace9d0df1893501ecb93c77180f0ff69cca79affb3c316dc8029__to_t_string_memory_ptr__fromStack_reversed(headStart ) -> tail {\n        tail := add(headStart, 32)\n\n        mstore(add(headStart, 0), sub(tail, headStart))\n        tail := abi_encode_t_stringliteral_24883cc5fe64ace9d0df1893501ecb93c77180f0ff69cca79affb3c316dc8029_to_t_string_memory_ptr_fromStack( tail)\n\n    }\n\n    function store_literal_in_memory_9924ebdf1add33d25d4ef888e16131f0a5687b0580a36c21b5c301a6c462effe(memPtr) {\n\n        mstore(add(memPtr, 0), \"Ownable: caller is not the owner\")\n\n    }\n\n    function abi_encode_t_stringliteral_9924ebdf1add33d25d4ef888e16131f0a5687b0580a36c21b5c301a6c462effe_to_t_string_memory_ptr_fromStack(pos) -> end {\n        pos := array_storeLengthForEncoding_t_string_memory_ptr_fromStack(pos, 32)\n        store_literal_in_memory_9924ebdf1add33d25d4ef888e16131f0a5687b0580a36c21b5c301a6c462effe(pos)\n        end := add(pos, 32)\n    }\n\n    function abi_encode_tuple_t_stringliteral_9924ebdf1add33d25d4ef888e16131f0a5687b0580a36c21b5c301a6c462effe__to_t_string_memory_ptr__fromStack_reversed(headStart ) -> tail {\n        tail := add(headStart, 32)\n\n        mstore(add(headStart, 0), sub(tail, headStart))\n        tail := abi_encode_t_stringliteral_9924ebdf1add33d25d4ef888e16131f0a5687b0580a36c21b5c301a6c462effe_to_t_string_memory_ptr_fromStack( tail)\n\n    }\n\n    function store_literal_in_memory_fc0b381caf0a47702017f3c4b358ebe3d3aff6c60ce819a8bf3ef5a95d4f202e(memPtr) {\n\n        mstore(add(memPtr, 0), \"ERC20: mint to the zero address\")\n\n    }\n\n    function abi_encode_t_stringliteral_fc0b381caf0a47702017f3c4b358ebe3d3aff6c60ce819a8bf3ef5a95d4f202e_to_t_string_memory_ptr_fromStack(pos) -> end {\n        pos := array_storeLengthForEncoding_t_string_memory_ptr_fromStack(pos, 31)\n        store_literal_in_memory_fc0b381caf0a47702017f3c4b358ebe3d3aff6c60ce819a8bf3ef5a95d4f202e(pos)\n        end := add(pos, 32)\n    }\n\n    function abi_encode_tuple_t_stringliteral_fc0b381caf0a47702017f3c4b358ebe3d3aff6c60ce819a8bf3ef5a95d4f202e__to_t_string_memory_ptr__fromStack_reversed(headStart ) -> tail {\n        tail := add(headStart, 32)\n\n        mstore(add(headStart, 0), sub(tail, headStart))\n        tail := abi_encode_t_stringliteral_fc0b381caf0a47702017f3c4b358ebe3d3aff6c60ce819a8bf3ef5a95d4f202e_to_t_string_memory_ptr_fromStack( tail)\n\n    }\n\n    function store_literal_in_memory_b16788493b576042bb52c50ed56189e0b250db113c7bfb1c3897d25cf9632d7f(memPtr) {\n\n        mstore(add(memPtr, 0), \"ERC20: burn from the zero addres\")\n\n        mstore(add(memPtr, 32), \"s\")\n\n    }\n\n    function abi_encode_t_stringliteral_b16788493b576042bb52c50ed56189e0b250db113c7bfb1c3897d25cf9632d7f_to_t_string_memory_ptr_fromStack(pos) -> end {\n        pos := array_storeLengthForEncoding_t_string_memory_ptr_fromStack(pos, 33)\n        store_literal_in_memory_b16788493b576042bb52c50ed56189e0b250db113c7bfb1c3897d25cf9632d7f(pos)\n        end := add(pos, 64)\n    }\n\n    function abi_encode_tuple_t_stringliteral_b16788493b576042bb52c50ed56189e0b250db113c7bfb1c3897d25cf9632d7f__to_t_string_memory_ptr__fromStack_reversed(headStart ) -> tail {\n        tail := add(headStart, 32)\n\n        mstore(add(headStart, 0), sub(tail, headStart))\n        tail := abi_encode_t_stringliteral_b16788493b576042bb52c50ed56189e0b250db113c7bfb1c3897d25cf9632d7f_to_t_string_memory_ptr_fromStack( tail)\n\n    }\n\n    function store_literal_in_memory_149b126e7125232b4200af45303d04fba8b74653b1a295a6a561a528c33fefdd(memPtr) {\n\n        mstore(add(memPtr, 0), \"ERC20: burn amount exceeds balan\")\n\n        mstore(add(memPtr, 32), \"ce\")\n\n    }\n\n    function abi_encode_t_stringliteral_149b126e7125232b4200af45303d04fba8b74653b1a295a6a561a528c33fefdd_to_t_string_memory_ptr_fromStack(pos) -> end {\n        pos := array_storeLengthForEncoding_t_string_memory_ptr_fromStack(pos, 34)\n        store_literal_in_memory_149b126e7125232b4200af45303d04fba8b74653b1a295a6a561a528c33fefdd(pos)\n        end := add(pos, 64)\n    }\n\n    function abi_encode_tuple_t_stringliteral_149b126e7125232b4200af45303d04fba8b74653b1a295a6a561a528c33fefdd__to_t_string_memory_ptr__fromStack_reversed(headStart ) -> tail {\n        tail := add(headStart, 32)\n\n        mstore(add(headStart, 0), sub(tail, headStart))\n        tail := abi_encode_t_stringliteral_149b126e7125232b4200af45303d04fba8b74653b1a295a6a561a528c33fefdd_to_t_string_memory_ptr_fromStack( tail)\n\n    }\n\n}\n",
            "id": 6,
            "language": "Yul",
            "name": "#utility.yul"
        }
    ],
    "sourceMap": "176:1105:5:-:0;;;258:93;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;320:5;327:7;2054:5:1;2046;:13;;;;;;:::i;:::-;;2079:7;2069;:17;;;;;;:::i;:::-;;1980:113;;936:32:0;955:12;:10;;;:12;;:::i;:::-;936:18;;;:32;;:::i;:::-;258:93:5;;176:1105;;640:96:4;693:7;719:10;712:17;;640:96;:::o;2426:187:0:-;2499:16;2518:6;;;;;;;;;;;2499:25;;2543:8;2534:6;;:17;;;;;;;;;;;;;;;;;;2597:8;2566:40;;2587:8;2566:40;;;;;;;;;;;;2489:124;2426:187;:::o;7:75:6:-;40:6;73:2;67:9;57:19;;7:75;:::o;88:117::-;197:1;194;187:12;211:117;320:1;317;310:12;334:117;443:1;440;433:12;457:117;566:1;563;556:12;580:102;621:6;672:2;668:7;663:2;656:5;652:14;648:28;638:38;;580:102;;;:::o;688:180::-;736:77;733:1;726:88;833:4;830:1;823:15;857:4;854:1;847:15;874:281;957:27;979:4;957:27;:::i;:::-;949:6;945:40;1087:6;1075:10;1072:22;1051:18;1039:10;1036:34;1033:62;1030:88;;;1098:18;;:::i;:::-;1030:88;1138:10;1134:2;1127:22;917:238;874:281;;:::o;1161:129::-;1195:6;1222:20;;:::i;:::-;1212:30;;1251:33;1279:4;1271:6;1251:33;:::i;:::-;1161:129;;;:::o;1296:308::-;1358:4;1448:18;1440:6;1437:30;1434:56;;;1470:18;;:::i;:::-;1434:56;1508:29;1530:6;1508:29;:::i;:::-;1500:37;;1592:4;1586;1582:15;1574:23;;1296:308;;;:::o;1610:246::-;1691:1;1701:113;1715:6;1712:1;1709:13;1701:113;;;1800:1;1795:3;1791:11;1785:18;1781:1;1776:3;1772:11;1765:39;1737:2;1734:1;1730:10;1725:15;;1701:113;;;1848:1;1839:6;1834:3;1830:16;1823:27;1672:184;1610:246;;;:::o;1862:434::-;1951:5;1976:66;1992:49;2034:6;1992:49;:::i;:::-;1976:66;:::i;:::-;1967:75;;2065:6;2058:5;2051:21;2103:4;2096:5;2092:16;2141:3;2132:6;2127:3;2123:16;2120:25;2117:112;;;2148:79;;:::i;:::-;2117:112;2238:52;2283:6;2278:3;2273;2238:52;:::i;:::-;1957:339;1862:434;;;;;:::o;2316:355::-;2383:5;2432:3;2425:4;2417:6;2413:17;2409:27;2399:122;;2440:79;;:::i;:::-;2399:122;2550:6;2544:13;2575:90;2661:3;2653:6;2646:4;2638:6;2634:17;2575:90;:::i;:::-;2566:99;;2389:282;2316:355;;;;:::o;2677:853::-;2776:6;2784;2833:2;2821:9;2812:7;2808:23;2804:32;2801:119;;;2839:79;;:::i;:::-;2801:119;2980:1;2969:9;2965:17;2959:24;3010:18;3002:6;2999:30;2996:117;;;3032:79;;:::i;:::-;2996:117;3137:74;3203:7;3194:6;3183:9;3179:22;3137:74;:::i;:::-;3127:84;;2930:291;3281:2;3270:9;3266:18;3260:25;3312:18;3304:6;3301:30;3298:117;;;3334:79;;:::i;:::-;3298:117;3439:74;3505:7;3496:6;3485:9;3481:22;3439:74;:::i;:::-;3429:84;;3231:292;2677:853;;;;;:::o;3536:99::-;3588:6;3622:5;3616:12;3606:22;;3536:99;;;:::o;3641:180::-;3689:77;3686:1;3679:88;3786:4;3783:1;3776:15;3810:4;3807:1;3800:15;3827:320;3871:6;3908:1;3902:4;3898:12;3888:22;;3955:1;3949:4;3945:12;3976:18;3966:81;;4032:4;4024:6;4020:17;4010:27;;3966:81;4094:2;4086:6;4083:14;4063:18;4060:38;4057:84;;4113:18;;:::i;:::-;4057:84;3878:269;3827:320;;;:::o;4153:141::-;4202:4;4225:3;4217:11;;4248:3;4245:1;4238:14;4282:4;4279:1;4269:18;4261:26;;4153:141;;;:::o;4300:93::-;4337:6;4384:2;4379;4372:5;4368:14;4364:23;4354:33;;4300:93;;;:::o;4399:107::-;4443:8;4493:5;4487:4;4483:16;4462:37;;4399:107;;;;:::o;4512:393::-;4581:6;4631:1;4619:10;4615:18;4654:97;4684:66;4673:9;4654:97;:::i;:::-;4772:39;4802:8;4791:9;4772:39;:::i;:::-;4760:51;;4844:4;4840:9;4833:5;4829:21;4820:30;;4893:4;4883:8;4879:19;4872:5;4869:30;4859:40;;4588:317;;4512:393;;;;;:::o;4911:77::-;4948:7;4977:5;4966:16;;4911:77;;;:::o;4994:60::-;5022:3;5043:5;5036:12;;4994:60;;;:::o;5060:142::-;5110:9;5143:53;5161:34;5170:24;5188:5;5170:24;:::i;:::-;5161:34;:::i;:::-;5143:53;:::i;:::-;5130:66;;5060:142;;;:::o;5208:75::-;5251:3;5272:5;5265:12;;5208:75;;;:::o;5289:269::-;5399:39;5430:7;5399:39;:::i;:::-;5460:91;5509:41;5533:16;5509:41;:::i;:::-;5501:6;5494:4;5488:11;5460:91;:::i;:::-;5454:4;5447:105;5365:193;5289:269;;;:::o;5564:73::-;5609:3;5564:73;:::o;5643:189::-;5720:32;;:::i;:::-;5761:65;5819:6;5811;5805:4;5761:65;:::i;:::-;5696:136;5643:189;;:::o;5838:186::-;5898:120;5915:3;5908:5;5905:14;5898:120;;;5969:39;6006:1;5999:5;5969:39;:::i;:::-;5942:1;5935:5;5931:13;5922:22;;5898:120;;;5838:186;;:::o;6030:543::-;6131:2;6126:3;6123:11;6120:446;;;6165:38;6197:5;6165:38;:::i;:::-;6249:29;6267:10;6249:29;:::i;:::-;6239:8;6235:44;6432:2;6420:10;6417:18;6414:49;;;6453:8;6438:23;;6414:49;6476:80;6532:22;6550:3;6532:22;:::i;:::-;6522:8;6518:37;6505:11;6476:80;:::i;:::-;6135:431;;6120:446;6030:543;;;:::o;6579:117::-;6633:8;6683:5;6677:4;6673:16;6652:37;;6579:117;;;;:::o;6702:169::-;6746:6;6779:51;6827:1;6823:6;6815:5;6812:1;6808:13;6779:51;:::i;:::-;6775:56;6860:4;6854;6850:15;6840:25;;6753:118;6702:169;;;;:::o;6876:295::-;6952:4;7098:29;7123:3;7117:4;7098:29;:::i;:::-;7090:37;;7160:3;7157:1;7153:11;7147:4;7144:21;7136:29;;6876:295;;;;:::o;7176:1395::-;7293:37;7326:3;7293:37;:::i;:::-;7395:18;7387:6;7384:30;7381:56;;;7417:18;;:::i;:::-;7381:56;7461:38;7493:4;7487:11;7461:38;:::i;:::-;7546:67;7606:6;7598;7592:4;7546:67;:::i;:::-;7640:1;7664:4;7651:17;;7696:2;7688:6;7685:14;7713:1;7708:618;;;;8370:1;8387:6;8384:77;;;8436:9;8431:3;8427:19;8421:26;8412:35;;8384:77;8487:67;8547:6;8540:5;8487:67;:::i;:::-;8481:4;8474:81;8343:222;7678:887;;7708:618;7760:4;7756:9;7748:6;7744:22;7794:37;7826:4;7794:37;:::i;:::-;7853:1;7867:208;7881:7;7878:1;7875:14;7867:208;;;7960:9;7955:3;7951:19;7945:26;7937:6;7930:42;8011:1;8003:6;7999:14;7989:24;;8058:2;8047:9;8043:18;8030:31;;7904:4;7901:1;7897:12;7892:17;;7867:208;;;8103:6;8094:7;8091:19;8088:179;;;8161:9;8156:3;8152:19;8146:26;8204:48;8246:4;8238:6;8234:17;8223:9;8204:48;:::i;:::-;8196:6;8189:64;8111:156;8088:179;8313:1;8309;8301:6;8297:14;8293:22;8287:4;8280:36;7715:611;;;7678:887;;7268:1303;;;7176:1395;;:::o;176:1105:5:-;;;;;;;",
    "deployedSourceMap": "176:1105:5:-:0;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;2158:98:1;;;:::i;:::-;;;;;;;:::i;:::-;;;;;;;;675:106:5;;;;;;;;;;;;;:::i;:::-;;:::i;:::-;;;;;;;:::i;:::-;;;;;;;;3255::1;;;:::i;:::-;;;;;;;:::i;:::-;;;;;;;;549:120:5;;;;;;;;;;;;;:::i;:::-;;:::i;:::-;;;;;;;:::i;:::-;;;;;;;;357:76;;;:::i;:::-;;;;;;;:::i;:::-;;;;;;;;5854:234:1;;;;;;;;;;;;;:::i;:::-;;:::i;:::-;;;;;;;:::i;:::-;;;;;;;;985:291:5;;;;;;;;;;;;;:::i;:::-;;:::i;:::-;;;;;;;:::i;:::-;;;;;;;;3419:125:1;;;;;;;;;;;;;:::i;:::-;;:::i;:::-;;;;;;;:::i;:::-;;;;;;;;1824:101:0;;;:::i;:::-;;1201:85;;;:::i;:::-;;;;;;;:::i;:::-;;;;;;;;2369:102:1;;;:::i;:::-;;;;;;;:::i;:::-;;;;;;;;6575:427;;;;;;;;;;;;;:::i;:::-;;:::i;:::-;;;;;;;:::i;:::-;;;;;;;;439:104:5;;;;;;;;;;;;;:::i;:::-;;:::i;:::-;;;;;;;:::i;:::-;;;;;;;;787:192;;;;;;;;;;;;;:::i;:::-;;:::i;:::-;;;;;;;:::i;:::-;;;;;;;;2074:198:0;;;;;;;;;;;;;:::i;:::-;;:::i;:::-;;2158:98:1;2212:13;2244:5;2237:12;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;2158:98;:::o;675:106:5:-;740:4;759:17;;;;;;;;;;;;;;3255:106:1;3316:7;3342:12;;3335:19;;3255:106;:::o;549:120:5:-;628:4;647:17;;;;;;;;;;;;;;357:76;407:5;357:76;:::o;5854:234:1:-;5942:4;5958:13;5974:12;:10;:12::i;:::-;5958:28;;5996:64;6005:5;6012:7;6049:10;6021:25;6031:5;6038:7;6021:9;:25::i;:::-;:38;;;;:::i;:::-;5996:8;:64::i;:::-;6077:4;6070:11;;;5854:234;;;;:::o;985:291:5:-;1058:4;1094:13:0;:11;:13::i;:::-;1070:12:5::1;1113:19;1129:2;1113:15;:19::i;:::-;1092:10;1085:48;;;;:::i;:::-;1070:63;;1151:1;1143:5;:9;1139:55;;;1162:25;1168:2;1180:5;1162;:25::i;:::-;1139:55;1211:1;1203:5;:9;1199:56;;;1222:26;1228:2;1241:5;1240:6;;;:::i;:::-;1222:5;:26::i;:::-;1199:56;1267:4;1260:11;;;985:291:::0;;;;:::o;3419:125:1:-;3493:7;3519:9;:18;3529:7;3519:18;;;;;;;;;;;;;;;;3512:25;;3419:125;;;:::o;1824:101:0:-;1094:13;:11;:13::i;:::-;1888:30:::1;1915:1;1888:18;:30::i;:::-;1824:101::o:0;1201:85::-;1247:7;1273:6;;;;;;;;;;;1266:13;;1201:85;:::o;2369:102:1:-;2425:13;2457:7;2450:14;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;:::i;:::-;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;2369:102;:::o;6575:427::-;6668:4;6684:13;6700:12;:10;:12::i;:::-;6684:28;;6722:24;6749:25;6759:5;6766:7;6749:9;:25::i;:::-;6722:52;;6812:15;6792:16;:35;;6784:85;;;;;;;;;;;;:::i;:::-;;;;;;;;;6903:60;6912:5;6919:7;6947:15;6928:16;:34;6903:8;:60::i;:::-;6991:4;6984:11;;;;6575:427;;;;:::o;439:104:5:-;502:4;521:17;;;;;;;;;;;;;;787:192;862:7;892:13;:11;:13::i;:::-;881:24;;:7;:24;;;877:98;;922:17;915:24;;;;877:98;967:1;960:8;;787:192;;;;;:::o;2074:198:0:-;1094:13;:11;:13::i;:::-;2182:1:::1;2162:22;;:8;:22;;::::0;2154:73:::1;;;;;;;;;;;;:::i;:::-;;;;;;;;;2237:28;2256:8;2237:18;:28::i;:::-;2074:198:::0;:::o;640:96:4:-;693:7;719:10;712:17;;640:96;:::o;10457:340:1:-;10575:1;10558:19;;:5;:19;;;10550:68;;;;;;;;;;;;:::i;:::-;;;;;;;;;10655:1;10636:21;;:7;:21;;;10628:68;;;;;;;;;;;;:::i;:::-;;;;;;;;;10737:6;10707:11;:18;10719:5;10707:18;;;;;;;;;;;;;;;:27;10726:7;10707:27;;;;;;;;;;;;;;;:36;;;;10774:7;10758:32;;10767:5;10758:32;;;10783:6;10758:32;;;;;;:::i;:::-;;;;;;;;10457:340;;;:::o;1359:130:0:-;1433:12;:10;:12::i;:::-;1422:23;;:7;:5;:7::i;:::-;:23;;;1414:68;;;;;;;;;;;;:::i;:::-;;;;;;;;;1359:130::o;8520:535:1:-;8622:1;8603:21;;:7;:21;;;8595:65;;;;;;;;;;;;:::i;:::-;;;;;;;;;8671:49;8700:1;8704:7;8713:6;8671:20;:49::i;:::-;8747:6;8731:12;;:22;;;;;;;:::i;:::-;;;;;;;;8921:6;8899:9;:18;8909:7;8899:18;;;;;;;;;;;;;;;;:28;;;;;;;;;;;8973:7;8952:37;;8969:1;8952:37;;;8982:6;8952:37;;;;;;:::i;:::-;;;;;;;;9000:48;9028:1;9032:7;9041:6;9000:19;:48::i;:::-;8520:535;;:::o;9375:659::-;9477:1;9458:21;;:7;:21;;;9450:67;;;;;;;;;;;;:::i;:::-;;;;;;;;;9528:49;9549:7;9566:1;9570:6;9528:20;:49::i;:::-;9588:22;9613:9;:18;9623:7;9613:18;;;;;;;;;;;;;;;;9588:43;;9667:6;9649:14;:24;;9641:71;;;;;;;;;;;;:::i;:::-;;;;;;;;;9784:6;9767:14;:23;9746:9;:18;9756:7;9746:18;;;;;;;;;;;;;;;:44;;;;9899:6;9883:12;;:22;;;;;;;;;;;9957:1;9931:37;;9940:7;9931:37;;;9961:6;9931:37;;;;;;:::i;:::-;;;;;;;;9979:48;9999:7;10016:1;10020:6;9979:19;:48::i;:::-;9440:594;9375:659;;:::o;2426:187:0:-;2499:16;2518:6;;;;;;;;;;;2499:25;;2543:8;2534:6;;:17;;;;;;;;;;;;;;;;;;2597:8;2566:40;;2587:8;2566:40;;;;;;;;;;;;2489:124;2426:187;:::o;12073:91:1:-;;;;:::o;12752:90::-;;;;:::o;7:99:6:-;59:6;93:5;87:12;77:22;;7:99;;;:::o;112:169::-;196:11;230:6;225:3;218:19;270:4;265:3;261:14;246:29;;112:169;;;;:::o;287:246::-;368:1;378:113;392:6;389:1;386:13;378:113;;;477:1;472:3;468:11;462:18;458:1;453:3;449:11;442:39;414:2;411:1;407:10;402:15;;378:113;;;525:1;516:6;511:3;507:16;500:27;349:184;287:246;;;:::o;539:102::-;580:6;631:2;627:7;622:2;615:5;611:14;607:28;597:38;;539:102;;;:::o;647:377::-;735:3;763:39;796:5;763:39;:::i;:::-;818:71;882:6;877:3;818:71;:::i;:::-;811:78;;898:65;956:6;951:3;944:4;937:5;933:16;898:65;:::i;:::-;988:29;1010:6;988:29;:::i;:::-;983:3;979:39;972:46;;739:285;647:377;;;;:::o;1030:313::-;1143:4;1181:2;1170:9;1166:18;1158:26;;1230:9;1224:4;1220:20;1216:1;1205:9;1201:17;1194:47;1258:78;1331:4;1322:6;1258:78;:::i;:::-;1250:86;;1030:313;;;;:::o;1430:117::-;1539:1;1536;1529:12;1676:126;1713:7;1753:42;1746:5;1742:54;1731:65;;1676:126;;;:::o;1808:96::-;1845:7;1874:24;1892:5;1874:24;:::i;:::-;1863:35;;1808:96;;;:::o;1910:122::-;1983:24;2001:5;1983:24;:::i;:::-;1976:5;1973:35;1963:63;;2022:1;2019;2012:12;1963:63;1910:122;:::o;2038:139::-;2084:5;2122:6;2109:20;2100:29;;2138:33;2165:5;2138:33;:::i;:::-;2038:139;;;;:::o;2183:77::-;2220:7;2249:5;2238:16;;2183:77;;;:::o;2266:122::-;2339:24;2357:5;2339:24;:::i;:::-;2332:5;2329:35;2319:63;;2378:1;2375;2368:12;2319:63;2266:122;:::o;2394:139::-;2440:5;2478:6;2465:20;2456:29;;2494:33;2521:5;2494:33;:::i;:::-;2394:139;;;;:::o;2539:474::-;2607:6;2615;2664:2;2652:9;2643:7;2639:23;2635:32;2632:119;;;2670:79;;:::i;:::-;2632:119;2790:1;2815:53;2860:7;2851:6;2840:9;2836:22;2815:53;:::i;:::-;2805:63;;2761:117;2917:2;2943:53;2988:7;2979:6;2968:9;2964:22;2943:53;:::i;:::-;2933:63;;2888:118;2539:474;;;;;:::o;3019:90::-;3053:7;3096:5;3089:13;3082:21;3071:32;;3019:90;;;:::o;3115:109::-;3196:21;3211:5;3196:21;:::i;:::-;3191:3;3184:34;3115:109;;:::o;3230:210::-;3317:4;3355:2;3344:9;3340:18;3332:26;;3368:65;3430:1;3419:9;3415:17;3406:6;3368:65;:::i;:::-;3230:210;;;;:::o;3446:118::-;3533:24;3551:5;3533:24;:::i;:::-;3528:3;3521:37;3446:118;;:::o;3570:222::-;3663:4;3701:2;3690:9;3686:18;3678:26;;3714:71;3782:1;3771:9;3767:17;3758:6;3714:71;:::i;:::-;3570:222;;;;:::o;3798:619::-;3875:6;3883;3891;3940:2;3928:9;3919:7;3915:23;3911:32;3908:119;;;3946:79;;:::i;:::-;3908:119;4066:1;4091:53;4136:7;4127:6;4116:9;4112:22;4091:53;:::i;:::-;4081:63;;4037:117;4193:2;4219:53;4264:7;4255:6;4244:9;4240:22;4219:53;:::i;:::-;4209:63;;4164:118;4321:2;4347:53;4392:7;4383:6;4372:9;4368:22;4347:53;:::i;:::-;4337:63;;4292:118;3798:619;;;;;:::o;4423:86::-;4458:7;4498:4;4491:5;4487:16;4476:27;;4423:86;;;:::o;4515:112::-;4598:22;4614:5;4598:22;:::i;:::-;4593:3;4586:35;4515:112;;:::o;4633:214::-;4722:4;4760:2;4749:9;4745:18;4737:26;;4773:67;4837:1;4826:9;4822:17;4813:6;4773:67;:::i;:::-;4633:214;;;;:::o;4853:329::-;4912:6;4961:2;4949:9;4940:7;4936:23;4932:32;4929:119;;;4967:79;;:::i;:::-;4929:119;5087:1;5112:53;5157:7;5148:6;5137:9;5133:22;5112:53;:::i;:::-;5102:63;;5058:117;4853:329;;;;:::o;5188:118::-;5275:24;5293:5;5275:24;:::i;:::-;5270:3;5263:37;5188:118;;:::o;5312:222::-;5405:4;5443:2;5432:9;5428:18;5420:26;;5456:71;5524:1;5513:9;5509:17;5500:6;5456:71;:::i;:::-;5312:222;;;;:::o;5540:474::-;5608:6;5616;5665:2;5653:9;5644:7;5640:23;5636:32;5633:119;;;5671:79;;:::i;:::-;5633:119;5791:1;5816:53;5861:7;5852:6;5841:9;5837:22;5816:53;:::i;:::-;5806:63;;5762:117;5918:2;5944:53;5989:7;5980:6;5969:9;5965:22;5944:53;:::i;:::-;5934:63;;5889:118;5540:474;;;;;:::o;6020:180::-;6068:77;6065:1;6058:88;6165:4;6162:1;6155:15;6189:4;6186:1;6179:15;6206:320;6250:6;6287:1;6281:4;6277:12;6267:22;;6334:1;6328:4;6324:12;6355:18;6345:81;;6411:4;6403:6;6399:17;6389:27;;6345:81;6473:2;6465:6;6462:14;6442:18;6439:38;6436:84;;6492:18;;:::i;:::-;6436:84;6257:269;6206:320;;;:::o;6532:180::-;6580:77;6577:1;6570:88;6677:4;6674:1;6667:15;6701:4;6698:1;6691:15;6718:191;6758:3;6777:20;6795:1;6777:20;:::i;:::-;6772:25;;6811:20;6829:1;6811:20;:::i;:::-;6806:25;;6854:1;6851;6847:9;6840:16;;6875:3;6872:1;6869:10;6866:36;;;6882:18;;:::i;:::-;6866:36;6718:191;;;;:::o;6915:76::-;6951:7;6980:5;6969:16;;6915:76;;;:::o;6997:372::-;7036:4;7056:19;7073:1;7056:19;:::i;:::-;7051:24;;7089:19;7106:1;7089:19;:::i;:::-;7084:24;;7132:1;7129;7125:9;7117:17;;7326:1;7320:4;7316:12;7312:1;7309;7305:9;7301:28;7284:1;7278:4;7274:12;7269:1;7266;7262:9;7255:17;7251:36;7235:104;7232:130;;;7342:18;;:::i;:::-;7232:130;6997:372;;;;:::o;7375:228::-;7410:3;7433:23;7450:5;7433:23;:::i;:::-;7424:32;;7478:66;7471:5;7468:77;7465:103;;7548:18;;:::i;:::-;7465:103;7591:5;7588:1;7584:13;7577:20;;7375:228;;;:::o;7609:224::-;7749:34;7745:1;7737:6;7733:14;7726:58;7818:7;7813:2;7805:6;7801:15;7794:32;7609:224;:::o;7839:366::-;7981:3;8002:67;8066:2;8061:3;8002:67;:::i;:::-;7995:74;;8078:93;8167:3;8078:93;:::i;:::-;8196:2;8191:3;8187:12;8180:19;;7839:366;;;:::o;8211:419::-;8377:4;8415:2;8404:9;8400:18;8392:26;;8464:9;8458:4;8454:20;8450:1;8439:9;8435:17;8428:47;8492:131;8618:4;8492:131;:::i;:::-;8484:139;;8211:419;;;:::o;8636:225::-;8776:34;8772:1;8764:6;8760:14;8753:58;8845:8;8840:2;8832:6;8828:15;8821:33;8636:225;:::o;8867:366::-;9009:3;9030:67;9094:2;9089:3;9030:67;:::i;:::-;9023:74;;9106:93;9195:3;9106:93;:::i;:::-;9224:2;9219:3;9215:12;9208:19;;8867:366;;;:::o;9239:419::-;9405:4;9443:2;9432:9;9428:18;9420:26;;9492:9;9486:4;9482:20;9478:1;9467:9;9463:17;9456:47;9520:131;9646:4;9520:131;:::i;:::-;9512:139;;9239:419;;;:::o;9664:223::-;9804:34;9800:1;9792:6;9788:14;9781:58;9873:6;9868:2;9860:6;9856:15;9849:31;9664:223;:::o;9893:366::-;10035:3;10056:67;10120:2;10115:3;10056:67;:::i;:::-;10049:74;;10132:93;10221:3;10132:93;:::i;:::-;10250:2;10245:3;10241:12;10234:19;;9893:366;;;:::o;10265:419::-;10431:4;10469:2;10458:9;10454:18;10446:26;;10518:9;10512:4;10508:20;10504:1;10493:9;10489:17;10482:47;10546:131;10672:4;10546:131;:::i;:::-;10538:139;;10265:419;;;:::o;10690:221::-;10830:34;10826:1;10818:6;10814:14;10807:58;10899:4;10894:2;10886:6;10882:15;10875:29;10690:221;:::o;10917:366::-;11059:3;11080:67;11144:2;11139:3;11080:67;:::i;:::-;11073:74;;11156:93;11245:3;11156:93;:::i;:::-;11274:2;11269:3;11265:12;11258:19;;10917:366;;;:::o;11289:419::-;11455:4;11493:2;11482:9;11478:18;11470:26;;11542:9;11536:4;11532:20;11528:1;11517:9;11513:17;11506:47;11570:131;11696:4;11570:131;:::i;:::-;11562:139;;11289:419;;;:::o;11714:182::-;11854:34;11850:1;11842:6;11838:14;11831:58;11714:182;:::o;11902:366::-;12044:3;12065:67;12129:2;12124:3;12065:67;:::i;:::-;12058:74;;12141:93;12230:3;12141:93;:::i;:::-;12259:2;12254:3;12250:12;12243:19;;11902:366;;;:::o;12274:419::-;12440:4;12478:2;12467:9;12463:18;12455:26;;12527:9;12521:4;12517:20;12513:1;12502:9;12498:17;12491:47;12555:131;12681:4;12555:131;:::i;:::-;12547:139;;12274:419;;;:::o;12699:181::-;12839:33;12835:1;12827:6;12823:14;12816:57;12699:181;:::o;12886:366::-;13028:3;13049:67;13113:2;13108:3;13049:67;:::i;:::-;13042:74;;13125:93;13214:3;13125:93;:::i;:::-;13243:2;13238:3;13234:12;13227:19;;12886:366;;;:::o;13258:419::-;13424:4;13462:2;13451:9;13447:18;13439:26;;13511:9;13505:4;13501:20;13497:1;13486:9;13482:17;13475:47;13539:131;13665:4;13539:131;:::i;:::-;13531:139;;13258:419;;;:::o;13683:220::-;13823:34;13819:1;13811:6;13807:14;13800:58;13892:3;13887:2;13879:6;13875:15;13868:28;13683:220;:::o;13909:366::-;14051:3;14072:67;14136:2;14131:3;14072:67;:::i;:::-;14065:74;;14148:93;14237:3;14148:93;:::i;:::-;14266:2;14261:3;14257:12;14250:19;;13909:366;;;:::o;14281:419::-;14447:4;14485:2;14474:9;14470:18;14462:26;;14534:9;14528:4;14524:20;14520:1;14509:9;14505:17;14498:47;14562:131;14688:4;14562:131;:::i;:::-;14554:139;;14281:419;;;:::o;14706:221::-;14846:34;14842:1;14834:6;14830:14;14823:58;14915:4;14910:2;14902:6;14898:15;14891:29;14706:221;:::o;14933:366::-;15075:3;15096:67;15160:2;15155:3;15096:67;:::i;:::-;15089:74;;15172:93;15261:3;15172:93;:::i;:::-;15290:2;15285:3;15281:12;15274:19;;14933:366;;;:::o;15305:419::-;15471:4;15509:2;15498:9;15494:18;15486:26;;15558:9;15552:4;15548:20;15544:1;15533:9;15529:17;15522:47;15586:131;15712:4;15586:131;:::i;:::-;15578:139;;15305:419;;;:::o",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity >=0.4.22 <0.9.0;\n\nimport \"@openzeppelin/contracts/token/ERC20/ERC20.sol\";\nimport \"@openzeppelin/contracts/access/Ownable.sol\";\n\ncontract Erc20VotesControlled is ERC20, Ownable {\n  error NotTransferable();\n  \n  constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) Ownable() {\n  }\n  \n  function decimals() public pure override returns (uint8) {\n    return 0;\n  }\n  \n  function transfer(address, uint) public pure override returns (bool) {\n    revert NotTransferable();\n  }\n  \n  function transferFrom(address, address, uint256) public pure override returns (bool) {\n    revert NotTransferable();\n  }\n  \n  function approve(address, uint256) public pure override returns (bool) {\n    revert NotTransferable();\n  }\n  \n  function allowance(address, address spender) public view override returns (uint256) {\n    if (spender == super.owner()) {\n      return type(uint256).max;\n    } else {\n      return 0;\n    }\n  }\n  \n  function allot(address to, uint256 newBalance) public onlyOwner returns (bool) {\n    int256 delta = int256(newBalance) - int256(super.balanceOf(to));\n    if (delta > 0) {\n      _mint(to, uint256(delta));\n    }\n    if (delta < 0) {\n      _burn(to, uint256(-delta));\n    }\n    return true;\n  }\n  \n}\n",
    "sourcePath": "/home/ootsun/IdeaProjects/daoscord/web3/contracts/Erc20VotesControlled.sol",
    "ast": {
        "absolutePath": "project:/contracts/Erc20VotesControlled.sol",
        "exportedSymbols": {
            "Context": [
                824
            ],
            "ERC20": [
                699
            ],
            "Erc20VotesControlled": [
                985
            ],
            "IERC20": [
                777
            ],
            "IERC20Metadata": [
                802
            ],
            "Ownable": [
                112
            ]
        },
        "id": 986,
        "license": "MIT",
        "nodeType": "SourceUnit",
        "nodes": [
            {
                "id": 826,
                "literals": [
                    "solidity",
                    ">=",
                    "0.4",
                    ".22",
                    "<",
                    "0.9",
                    ".0"
                ],
                "nodeType": "PragmaDirective",
                "src": "32:32:5"
            },
            {
                "absolutePath": "@openzeppelin/contracts/token/ERC20/ERC20.sol",
                "file": "@openzeppelin/contracts/token/ERC20/ERC20.sol",
                "id": 827,
                "nameLocation": "-1:-1:-1",
                "nodeType": "ImportDirective",
                "scope": 986,
                "sourceUnit": 700,
                "src": "66:55:5",
                "symbolAliases": [],
                "unitAlias": ""
            },
            {
                "absolutePath": "@openzeppelin/contracts/access/Ownable.sol",
                "file": "@openzeppelin/contracts/access/Ownable.sol",
                "id": 828,
                "nameLocation": "-1:-1:-1",
                "nodeType": "ImportDirective",
                "scope": 986,
                "sourceUnit": 113,
                "src": "122:52:5",
                "symbolAliases": [],
                "unitAlias": ""
            },
            {
                "abstract": false,
                "baseContracts": [
                    {
                        "baseName": {
                            "id": 829,
                            "name": "ERC20",
                            "nameLocations": [
                                "209:5:5"
                            ],
                            "nodeType": "IdentifierPath",
                            "referencedDeclaration": 699,
                            "src": "209:5:5"
                        },
                        "id": 830,
                        "nodeType": "InheritanceSpecifier",
                        "src": "209:5:5"
                    },
                    {
                        "baseName": {
                            "id": 831,
                            "name": "Ownable",
                            "nameLocations": [
                                "216:7:5"
                            ],
                            "nodeType": "IdentifierPath",
                            "referencedDeclaration": 112,
                            "src": "216:7:5"
                        },
                        "id": 832,
                        "nodeType": "InheritanceSpecifier",
                        "src": "216:7:5"
                    }
                ],
                "canonicalName": "Erc20VotesControlled",
                "contractDependencies": [],
                "contractKind": "contract",
                "fullyImplemented": true,
                "id": 985,
                "linearizedBaseContracts": [
                    985,
                    112,
                    699,
                    802,
                    777,
                    824
                ],
                "name": "Erc20VotesControlled",
                "nameLocation": "185:20:5",
                "nodeType": "ContractDefinition",
                "nodes": [
                    {
                        "errorSelector": "dc8d8db7",
                        "id": 834,
                        "name": "NotTransferable",
                        "nameLocation": "234:15:5",
                        "nodeType": "ErrorDefinition",
                        "parameters": {
                            "id": 833,
                            "nodeType": "ParameterList",
                            "parameters": [],
                            "src": "249:2:5"
                        },
                        "src": "228:24:5"
                    },
                    {
                        "body": {
                            "id": 847,
                            "nodeType": "Block",
                            "src": "346:5:5",
                            "statements": []
                        },
                        "id": 848,
                        "implemented": true,
                        "kind": "constructor",
                        "modifiers": [
                            {
                                "arguments": [
                                    {
                                        "id": 841,
                                        "name": "name_",
                                        "nodeType": "Identifier",
                                        "overloadedDeclarations": [],
                                        "referencedDeclaration": 836,
                                        "src": "320:5:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_string_memory_ptr",
                                            "typeString": "string memory"
                                        }
                                    },
                                    {
                                        "id": 842,
                                        "name": "symbol_",
                                        "nodeType": "Identifier",
                                        "overloadedDeclarations": [],
                                        "referencedDeclaration": 838,
                                        "src": "327:7:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_string_memory_ptr",
                                            "typeString": "string memory"
                                        }
                                    }
                                ],
                                "id": 843,
                                "kind": "baseConstructorSpecifier",
                                "modifierName": {
                                    "id": 840,
                                    "name": "ERC20",
                                    "nameLocations": [
                                        "314:5:5"
                                    ],
                                    "nodeType": "IdentifierPath",
                                    "referencedDeclaration": 699,
                                    "src": "314:5:5"
                                },
                                "nodeType": "ModifierInvocation",
                                "src": "314:21:5"
                            },
                            {
                                "arguments": [],
                                "id": 845,
                                "kind": "baseConstructorSpecifier",
                                "modifierName": {
                                    "id": 844,
                                    "name": "Ownable",
                                    "nameLocations": [
                                        "336:7:5"
                                    ],
                                    "nodeType": "IdentifierPath",
                                    "referencedDeclaration": 112,
                                    "src": "336:7:5"
                                },
                                "nodeType": "ModifierInvocation",
                                "src": "336:9:5"
                            }
                        ],
                        "name": "",
                        "nameLocation": "-1:-1:-1",
                        "nodeType": "FunctionDefinition",
                        "parameters": {
                            "id": 839,
                            "nodeType": "ParameterList",
                            "parameters": [
                                {
                                    "constant": false,
                                    "id": 836,
                                    "mutability": "mutable",
                                    "name": "name_",
                                    "nameLocation": "284:5:5",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 848,
                                    "src": "270:19:5",
                                    "stateVariable": false,
                                    "storageLocation": "memory",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_string_memory_ptr",
                                        "typeString": "string"
                                    },
                                    "typeName": {
                                        "id": 835,
                                        "name": "string",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "270:6:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_string_storage_ptr",
                                            "typeString": "string"
                                        }
                                    },
                                    "visibility": "internal"
                                },
                                {
                                    "constant": false,
                                    "id": 838,
                                    "mutability": "mutable",
                                    "name": "symbol_",
                                    "nameLocation": "305:7:5",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 848,
                                    "src": "291:21:5",
                                    "stateVariable": false,
                                    "storageLocation": "memory",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_string_memory_ptr",
                                        "typeString": "string"
                                    },
                                    "typeName": {
                                        "id": 837,
                                        "name": "string",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "291:6:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_string_storage_ptr",
                                            "typeString": "string"
                                        }
                                    },
                                    "visibility": "internal"
                                }
                            ],
                            "src": "269:44:5"
                        },
                        "returnParameters": {
                            "id": 846,
                            "nodeType": "ParameterList",
                            "parameters": [],
                            "src": "346:0:5"
                        },
                        "scope": 985,
                        "src": "258:93:5",
                        "stateMutability": "nonpayable",
                        "virtual": false,
                        "visibility": "public"
                    },
                    {
                        "baseFunctions": [
                            187
                        ],
                        "body": {
                            "id": 856,
                            "nodeType": "Block",
                            "src": "414:19:5",
                            "statements": [
                                {
                                    "expression": {
                                        "hexValue": "30",
                                        "id": 854,
                                        "isConstant": false,
                                        "isLValue": false,
                                        "isPure": true,
                                        "kind": "number",
                                        "lValueRequested": false,
                                        "nodeType": "Literal",
                                        "src": "427:1:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_rational_0_by_1",
                                            "typeString": "int_const 0"
                                        },
                                        "value": "0"
                                    },
                                    "functionReturnParameters": 853,
                                    "id": 855,
                                    "nodeType": "Return",
                                    "src": "420:8:5"
                                }
                            ]
                        },
                        "functionSelector": "313ce567",
                        "id": 857,
                        "implemented": true,
                        "kind": "function",
                        "modifiers": [],
                        "name": "decimals",
                        "nameLocation": "366:8:5",
                        "nodeType": "FunctionDefinition",
                        "overrides": {
                            "id": 850,
                            "nodeType": "OverrideSpecifier",
                            "overrides": [],
                            "src": "389:8:5"
                        },
                        "parameters": {
                            "id": 849,
                            "nodeType": "ParameterList",
                            "parameters": [],
                            "src": "374:2:5"
                        },
                        "returnParameters": {
                            "id": 853,
                            "nodeType": "ParameterList",
                            "parameters": [
                                {
                                    "constant": false,
                                    "id": 852,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 857,
                                    "src": "407:5:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_uint8",
                                        "typeString": "uint8"
                                    },
                                    "typeName": {
                                        "id": 851,
                                        "name": "uint8",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "407:5:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_uint8",
                                            "typeString": "uint8"
                                        }
                                    },
                                    "visibility": "internal"
                                }
                            ],
                            "src": "406:7:5"
                        },
                        "scope": 985,
                        "src": "357:76:5",
                        "stateMutability": "pure",
                        "virtual": false,
                        "visibility": "public"
                    },
                    {
                        "baseFunctions": [
                            236
                        ],
                        "body": {
                            "id": 870,
                            "nodeType": "Block",
                            "src": "508:35:5",
                            "statements": [
                                {
                                    "errorCall": {
                                        "arguments": [],
                                        "expression": {
                                            "argumentTypes": [],
                                            "id": 867,
                                            "name": "NotTransferable",
                                            "nodeType": "Identifier",
                                            "overloadedDeclarations": [],
                                            "referencedDeclaration": 834,
                                            "src": "521:15:5",
                                            "typeDescriptions": {
                                                "typeIdentifier": "t_function_error_pure$__$returns$__$",
                                                "typeString": "function () pure"
                                            }
                                        },
                                        "id": 868,
                                        "isConstant": false,
                                        "isLValue": false,
                                        "isPure": false,
                                        "kind": "functionCall",
                                        "lValueRequested": false,
                                        "nameLocations": [],
                                        "names": [],
                                        "nodeType": "FunctionCall",
                                        "src": "521:17:5",
                                        "tryCall": false,
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_tuple$__$",
                                            "typeString": "tuple()"
                                        }
                                    },
                                    "id": 869,
                                    "nodeType": "RevertStatement",
                                    "src": "514:24:5"
                                }
                            ]
                        },
                        "functionSelector": "a9059cbb",
                        "id": 871,
                        "implemented": true,
                        "kind": "function",
                        "modifiers": [],
                        "name": "transfer",
                        "nameLocation": "448:8:5",
                        "nodeType": "FunctionDefinition",
                        "overrides": {
                            "id": 863,
                            "nodeType": "OverrideSpecifier",
                            "overrides": [],
                            "src": "484:8:5"
                        },
                        "parameters": {
                            "id": 862,
                            "nodeType": "ParameterList",
                            "parameters": [
                                {
                                    "constant": false,
                                    "id": 859,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 871,
                                    "src": "457:7:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_address",
                                        "typeString": "address"
                                    },
                                    "typeName": {
                                        "id": 858,
                                        "name": "address",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "457:7:5",
                                        "stateMutability": "nonpayable",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_address",
                                            "typeString": "address"
                                        }
                                    },
                                    "visibility": "internal"
                                },
                                {
                                    "constant": false,
                                    "id": 861,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 871,
                                    "src": "466:4:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_uint256",
                                        "typeString": "uint256"
                                    },
                                    "typeName": {
                                        "id": 860,
                                        "name": "uint",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "466:4:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_uint256",
                                            "typeString": "uint256"
                                        }
                                    },
                                    "visibility": "internal"
                                }
                            ],
                            "src": "456:15:5"
                        },
                        "returnParameters": {
                            "id": 866,
                            "nodeType": "ParameterList",
                            "parameters": [
                                {
                                    "constant": false,
                                    "id": 865,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 871,
                                    "src": "502:4:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_bool",
                                        "typeString": "bool"
                                    },
                                    "typeName": {
                                        "id": 864,
                                        "name": "bool",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "502:4:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_bool",
                                            "typeString": "bool"
                                        }
                                    },
                                    "visibility": "internal"
                                }
                            ],
                            "src": "501:6:5"
                        },
                        "scope": 985,
                        "src": "439:104:5",
                        "stateMutability": "pure",
                        "virtual": false,
                        "visibility": "public"
                    },
                    {
                        "baseFunctions": [
                            312
                        ],
                        "body": {
                            "id": 886,
                            "nodeType": "Block",
                            "src": "634:35:5",
                            "statements": [
                                {
                                    "errorCall": {
                                        "arguments": [],
                                        "expression": {
                                            "argumentTypes": [],
                                            "id": 883,
                                            "name": "NotTransferable",
                                            "nodeType": "Identifier",
                                            "overloadedDeclarations": [],
                                            "referencedDeclaration": 834,
                                            "src": "647:15:5",
                                            "typeDescriptions": {
                                                "typeIdentifier": "t_function_error_pure$__$returns$__$",
                                                "typeString": "function () pure"
                                            }
                                        },
                                        "id": 884,
                                        "isConstant": false,
                                        "isLValue": false,
                                        "isPure": false,
                                        "kind": "functionCall",
                                        "lValueRequested": false,
                                        "nameLocations": [],
                                        "names": [],
                                        "nodeType": "FunctionCall",
                                        "src": "647:17:5",
                                        "tryCall": false,
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_tuple$__$",
                                            "typeString": "tuple()"
                                        }
                                    },
                                    "id": 885,
                                    "nodeType": "RevertStatement",
                                    "src": "640:24:5"
                                }
                            ]
                        },
                        "functionSelector": "23b872dd",
                        "id": 887,
                        "implemented": true,
                        "kind": "function",
                        "modifiers": [],
                        "name": "transferFrom",
                        "nameLocation": "558:12:5",
                        "nodeType": "FunctionDefinition",
                        "overrides": {
                            "id": 879,
                            "nodeType": "OverrideSpecifier",
                            "overrides": [],
                            "src": "610:8:5"
                        },
                        "parameters": {
                            "id": 878,
                            "nodeType": "ParameterList",
                            "parameters": [
                                {
                                    "constant": false,
                                    "id": 873,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 887,
                                    "src": "571:7:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_address",
                                        "typeString": "address"
                                    },
                                    "typeName": {
                                        "id": 872,
                                        "name": "address",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "571:7:5",
                                        "stateMutability": "nonpayable",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_address",
                                            "typeString": "address"
                                        }
                                    },
                                    "visibility": "internal"
                                },
                                {
                                    "constant": false,
                                    "id": 875,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 887,
                                    "src": "580:7:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_address",
                                        "typeString": "address"
                                    },
                                    "typeName": {
                                        "id": 874,
                                        "name": "address",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "580:7:5",
                                        "stateMutability": "nonpayable",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_address",
                                            "typeString": "address"
                                        }
                                    },
                                    "visibility": "internal"
                                },
                                {
                                    "constant": false,
                                    "id": 877,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 887,
                                    "src": "589:7:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_uint256",
                                        "typeString": "uint256"
                                    },
                                    "typeName": {
                                        "id": 876,
                                        "name": "uint256",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "589:7:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_uint256",
                                            "typeString": "uint256"
                                        }
                                    },
                                    "visibility": "internal"
                                }
                            ],
                            "src": "570:27:5"
                        },
                        "returnParameters": {
                            "id": 882,
                            "nodeType": "ParameterList",
                            "parameters": [
                                {
                                    "constant": false,
                                    "id": 881,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 887,
                                    "src": "628:4:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_bool",
                                        "typeString": "bool"
                                    },
                                    "typeName": {
                                        "id": 880,
                                        "name": "bool",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "628:4:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_bool",
                                            "typeString": "bool"
                                        }
                                    },
                                    "visibility": "internal"
                                }
                            ],
                            "src": "627:6:5"
                        },
                        "scope": 985,
                        "src": "549:120:5",
                        "stateMutability": "pure",
                        "virtual": false,
                        "visibility": "public"
                    },
                    {
                        "baseFunctions": [
                            279
                        ],
                        "body": {
                            "id": 900,
                            "nodeType": "Block",
                            "src": "746:35:5",
                            "statements": [
                                {
                                    "errorCall": {
                                        "arguments": [],
                                        "expression": {
                                            "argumentTypes": [],
                                            "id": 897,
                                            "name": "NotTransferable",
                                            "nodeType": "Identifier",
                                            "overloadedDeclarations": [],
                                            "referencedDeclaration": 834,
                                            "src": "759:15:5",
                                            "typeDescriptions": {
                                                "typeIdentifier": "t_function_error_pure$__$returns$__$",
                                                "typeString": "function () pure"
                                            }
                                        },
                                        "id": 898,
                                        "isConstant": false,
                                        "isLValue": false,
                                        "isPure": false,
                                        "kind": "functionCall",
                                        "lValueRequested": false,
                                        "nameLocations": [],
                                        "names": [],
                                        "nodeType": "FunctionCall",
                                        "src": "759:17:5",
                                        "tryCall": false,
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_tuple$__$",
                                            "typeString": "tuple()"
                                        }
                                    },
                                    "id": 899,
                                    "nodeType": "RevertStatement",
                                    "src": "752:24:5"
                                }
                            ]
                        },
                        "functionSelector": "095ea7b3",
                        "id": 901,
                        "implemented": true,
                        "kind": "function",
                        "modifiers": [],
                        "name": "approve",
                        "nameLocation": "684:7:5",
                        "nodeType": "FunctionDefinition",
                        "overrides": {
                            "id": 893,
                            "nodeType": "OverrideSpecifier",
                            "overrides": [],
                            "src": "722:8:5"
                        },
                        "parameters": {
                            "id": 892,
                            "nodeType": "ParameterList",
                            "parameters": [
                                {
                                    "constant": false,
                                    "id": 889,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 901,
                                    "src": "692:7:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_address",
                                        "typeString": "address"
                                    },
                                    "typeName": {
                                        "id": 888,
                                        "name": "address",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "692:7:5",
                                        "stateMutability": "nonpayable",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_address",
                                            "typeString": "address"
                                        }
                                    },
                                    "visibility": "internal"
                                },
                                {
                                    "constant": false,
                                    "id": 891,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 901,
                                    "src": "701:7:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_uint256",
                                        "typeString": "uint256"
                                    },
                                    "typeName": {
                                        "id": 890,
                                        "name": "uint256",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "701:7:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_uint256",
                                            "typeString": "uint256"
                                        }
                                    },
                                    "visibility": "internal"
                                }
                            ],
                            "src": "691:18:5"
                        },
                        "returnParameters": {
                            "id": 896,
                            "nodeType": "ParameterList",
                            "parameters": [
                                {
                                    "constant": false,
                                    "id": 895,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 901,
                                    "src": "740:4:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_bool",
                                        "typeString": "bool"
                                    },
                                    "typeName": {
                                        "id": 894,
                                        "name": "bool",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "740:4:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_bool",
                                            "typeString": "bool"
                                        }
                                    },
                                    "visibility": "internal"
                                }
                            ],
                            "src": "739:6:5"
                        },
                        "scope": 985,
                        "src": "675:106:5",
                        "stateMutability": "pure",
                        "virtual": false,
                        "visibility": "public"
                    },
                    {
                        "baseFunctions": [
                            254
                        ],
                        "body": {
                            "id": 927,
                            "nodeType": "Block",
                            "src": "871:108:5",
                            "statements": [
                                {
                                    "condition": {
                                        "commonType": {
                                            "typeIdentifier": "t_address",
                                            "typeString": "address"
                                        },
                                        "id": 915,
                                        "isConstant": false,
                                        "isLValue": false,
                                        "isPure": false,
                                        "lValueRequested": false,
                                        "leftExpression": {
                                            "id": 911,
                                            "name": "spender",
                                            "nodeType": "Identifier",
                                            "overloadedDeclarations": [],
                                            "referencedDeclaration": 905,
                                            "src": "881:7:5",
                                            "typeDescriptions": {
                                                "typeIdentifier": "t_address",
                                                "typeString": "address"
                                            }
                                        },
                                        "nodeType": "BinaryOperation",
                                        "operator": "==",
                                        "rightExpression": {
                                            "arguments": [],
                                            "expression": {
                                                "argumentTypes": [],
                                                "expression": {
                                                    "id": 912,
                                                    "name": "super",
                                                    "nodeType": "Identifier",
                                                    "overloadedDeclarations": [],
                                                    "referencedDeclaration": 4294967271,
                                                    "src": "892:5:5",
                                                    "typeDescriptions": {
                                                        "typeIdentifier": "t_type$_t_super$_Erc20VotesControlled_$985_$",
                                                        "typeString": "type(contract super Erc20VotesControlled)"
                                                    }
                                                },
                                                "id": 913,
                                                "isConstant": false,
                                                "isLValue": false,
                                                "isPure": false,
                                                "lValueRequested": false,
                                                "memberLocation": "898:5:5",
                                                "memberName": "owner",
                                                "nodeType": "MemberAccess",
                                                "referencedDeclaration": 40,
                                                "src": "892:11:5",
                                                "typeDescriptions": {
                                                    "typeIdentifier": "t_function_internal_view$__$returns$_t_address_$",
                                                    "typeString": "function () view returns (address)"
                                                }
                                            },
                                            "id": 914,
                                            "isConstant": false,
                                            "isLValue": false,
                                            "isPure": false,
                                            "kind": "functionCall",
                                            "lValueRequested": false,
                                            "nameLocations": [],
                                            "names": [],
                                            "nodeType": "FunctionCall",
                                            "src": "892:13:5",
                                            "tryCall": false,
                                            "typeDescriptions": {
                                                "typeIdentifier": "t_address",
                                                "typeString": "address"
                                            }
                                        },
                                        "src": "881:24:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_bool",
                                            "typeString": "bool"
                                        }
                                    },
                                    "falseBody": {
                                        "id": 925,
                                        "nodeType": "Block",
                                        "src": "952:23:5",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "hexValue": "30",
                                                    "id": 923,
                                                    "isConstant": false,
                                                    "isLValue": false,
                                                    "isPure": true,
                                                    "kind": "number",
                                                    "lValueRequested": false,
                                                    "nodeType": "Literal",
                                                    "src": "967:1:5",
                                                    "typeDescriptions": {
                                                        "typeIdentifier": "t_rational_0_by_1",
                                                        "typeString": "int_const 0"
                                                    },
                                                    "value": "0"
                                                },
                                                "functionReturnParameters": 910,
                                                "id": 924,
                                                "nodeType": "Return",
                                                "src": "960:8:5"
                                            }
                                        ]
                                    },
                                    "id": 926,
                                    "nodeType": "IfStatement",
                                    "src": "877:98:5",
                                    "trueBody": {
                                        "id": 922,
                                        "nodeType": "Block",
                                        "src": "907:39:5",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "expression": {
                                                        "arguments": [
                                                            {
                                                                "id": 918,
                                                                "isConstant": false,
                                                                "isLValue": false,
                                                                "isPure": true,
                                                                "lValueRequested": false,
                                                                "nodeType": "ElementaryTypeNameExpression",
                                                                "src": "927:7:5",
                                                                "typeDescriptions": {
                                                                    "typeIdentifier": "t_type$_t_uint256_$",
                                                                    "typeString": "type(uint256)"
                                                                },
                                                                "typeName": {
                                                                    "id": 917,
                                                                    "name": "uint256",
                                                                    "nodeType": "ElementaryTypeName",
                                                                    "src": "927:7:5",
                                                                    "typeDescriptions": {}
                                                                }
                                                            }
                                                        ],
                                                        "expression": {
                                                            "argumentTypes": [
                                                                {
                                                                    "typeIdentifier": "t_type$_t_uint256_$",
                                                                    "typeString": "type(uint256)"
                                                                }
                                                            ],
                                                            "id": 916,
                                                            "name": "type",
                                                            "nodeType": "Identifier",
                                                            "overloadedDeclarations": [],
                                                            "referencedDeclaration": 4294967269,
                                                            "src": "922:4:5",
                                                            "typeDescriptions": {
                                                                "typeIdentifier": "t_function_metatype_pure$__$returns$__$",
                                                                "typeString": "function () pure"
                                                            }
                                                        },
                                                        "id": 919,
                                                        "isConstant": false,
                                                        "isLValue": false,
                                                        "isPure": true,
                                                        "kind": "functionCall",
                                                        "lValueRequested": false,
                                                        "nameLocations": [],
                                                        "names": [],
                                                        "nodeType": "FunctionCall",
                                                        "src": "922:13:5",
                                                        "tryCall": false,
                                                        "typeDescriptions": {
                                                            "typeIdentifier": "t_magic_meta_type_t_uint256",
                                                            "typeString": "type(uint256)"
                                                        }
                                                    },
                                                    "id": 920,
                                                    "isConstant": false,
                                                    "isLValue": false,
                                                    "isPure": true,
                                                    "lValueRequested": false,
                                                    "memberLocation": "936:3:5",
                                                    "memberName": "max",
                                                    "nodeType": "MemberAccess",
                                                    "src": "922:17:5",
                                                    "typeDescriptions": {
                                                        "typeIdentifier": "t_uint256",
                                                        "typeString": "uint256"
                                                    }
                                                },
                                                "functionReturnParameters": 910,
                                                "id": 921,
                                                "nodeType": "Return",
                                                "src": "915:24:5"
                                            }
                                        ]
                                    }
                                }
                            ]
                        },
                        "functionSelector": "dd62ed3e",
                        "id": 928,
                        "implemented": true,
                        "kind": "function",
                        "modifiers": [],
                        "name": "allowance",
                        "nameLocation": "796:9:5",
                        "nodeType": "FunctionDefinition",
                        "overrides": {
                            "id": 907,
                            "nodeType": "OverrideSpecifier",
                            "overrides": [],
                            "src": "844:8:5"
                        },
                        "parameters": {
                            "id": 906,
                            "nodeType": "ParameterList",
                            "parameters": [
                                {
                                    "constant": false,
                                    "id": 903,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 928,
                                    "src": "806:7:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_address",
                                        "typeString": "address"
                                    },
                                    "typeName": {
                                        "id": 902,
                                        "name": "address",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "806:7:5",
                                        "stateMutability": "nonpayable",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_address",
                                            "typeString": "address"
                                        }
                                    },
                                    "visibility": "internal"
                                },
                                {
                                    "constant": false,
                                    "id": 905,
                                    "mutability": "mutable",
                                    "name": "spender",
                                    "nameLocation": "823:7:5",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 928,
                                    "src": "815:15:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_address",
                                        "typeString": "address"
                                    },
                                    "typeName": {
                                        "id": 904,
                                        "name": "address",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "815:7:5",
                                        "stateMutability": "nonpayable",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_address",
                                            "typeString": "address"
                                        }
                                    },
                                    "visibility": "internal"
                                }
                            ],
                            "src": "805:26:5"
                        },
                        "returnParameters": {
                            "id": 910,
                            "nodeType": "ParameterList",
                            "parameters": [
                                {
                                    "constant": false,
                                    "id": 909,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 928,
                                    "src": "862:7:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_uint256",
                                        "typeString": "uint256"
                                    },
                                    "typeName": {
                                        "id": 908,
                                        "name": "uint256",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "862:7:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_uint256",
                                            "typeString": "uint256"
                                        }
                                    },
                                    "visibility": "internal"
                                }
                            ],
                            "src": "861:9:5"
                        },
                        "scope": 985,
                        "src": "787:192:5",
                        "stateMutability": "view",
                        "virtual": false,
                        "visibility": "public"
                    },
                    {
                        "body": {
                            "id": 983,
                            "nodeType": "Block",
                            "src": "1064:212:5",
                            "statements": [
                                {
                                    "assignments": [
                                        940
                                    ],
                                    "declarations": [
                                        {
                                            "constant": false,
                                            "id": 940,
                                            "mutability": "mutable",
                                            "name": "delta",
                                            "nameLocation": "1077:5:5",
                                            "nodeType": "VariableDeclaration",
                                            "scope": 983,
                                            "src": "1070:12:5",
                                            "stateVariable": false,
                                            "storageLocation": "default",
                                            "typeDescriptions": {
                                                "typeIdentifier": "t_int256",
                                                "typeString": "int256"
                                            },
                                            "typeName": {
                                                "id": 939,
                                                "name": "int256",
                                                "nodeType": "ElementaryTypeName",
                                                "src": "1070:6:5",
                                                "typeDescriptions": {
                                                    "typeIdentifier": "t_int256",
                                                    "typeString": "int256"
                                                }
                                            },
                                            "visibility": "internal"
                                        }
                                    ],
                                    "id": 953,
                                    "initialValue": {
                                        "commonType": {
                                            "typeIdentifier": "t_int256",
                                            "typeString": "int256"
                                        },
                                        "id": 952,
                                        "isConstant": false,
                                        "isLValue": false,
                                        "isPure": false,
                                        "lValueRequested": false,
                                        "leftExpression": {
                                            "arguments": [
                                                {
                                                    "id": 943,
                                                    "name": "newBalance",
                                                    "nodeType": "Identifier",
                                                    "overloadedDeclarations": [],
                                                    "referencedDeclaration": 932,
                                                    "src": "1092:10:5",
                                                    "typeDescriptions": {
                                                        "typeIdentifier": "t_uint256",
                                                        "typeString": "uint256"
                                                    }
                                                }
                                            ],
                                            "expression": {
                                                "argumentTypes": [
                                                    {
                                                        "typeIdentifier": "t_uint256",
                                                        "typeString": "uint256"
                                                    }
                                                ],
                                                "id": 942,
                                                "isConstant": false,
                                                "isLValue": false,
                                                "isPure": true,
                                                "lValueRequested": false,
                                                "nodeType": "ElementaryTypeNameExpression",
                                                "src": "1085:6:5",
                                                "typeDescriptions": {
                                                    "typeIdentifier": "t_type$_t_int256_$",
                                                    "typeString": "type(int256)"
                                                },
                                                "typeName": {
                                                    "id": 941,
                                                    "name": "int256",
                                                    "nodeType": "ElementaryTypeName",
                                                    "src": "1085:6:5",
                                                    "typeDescriptions": {}
                                                }
                                            },
                                            "id": 944,
                                            "isConstant": false,
                                            "isLValue": false,
                                            "isPure": false,
                                            "kind": "typeConversion",
                                            "lValueRequested": false,
                                            "nameLocations": [],
                                            "names": [],
                                            "nodeType": "FunctionCall",
                                            "src": "1085:18:5",
                                            "tryCall": false,
                                            "typeDescriptions": {
                                                "typeIdentifier": "t_int256",
                                                "typeString": "int256"
                                            }
                                        },
                                        "nodeType": "BinaryOperation",
                                        "operator": "-",
                                        "rightExpression": {
                                            "arguments": [
                                                {
                                                    "arguments": [
                                                        {
                                                            "id": 949,
                                                            "name": "to",
                                                            "nodeType": "Identifier",
                                                            "overloadedDeclarations": [],
                                                            "referencedDeclaration": 930,
                                                            "src": "1129:2:5",
                                                            "typeDescriptions": {
                                                                "typeIdentifier": "t_address",
                                                                "typeString": "address"
                                                            }
                                                        }
                                                    ],
                                                    "expression": {
                                                        "argumentTypes": [
                                                            {
                                                                "typeIdentifier": "t_address",
                                                                "typeString": "address"
                                                            }
                                                        ],
                                                        "expression": {
                                                            "id": 947,
                                                            "name": "super",
                                                            "nodeType": "Identifier",
                                                            "overloadedDeclarations": [],
                                                            "referencedDeclaration": 4294967271,
                                                            "src": "1113:5:5",
                                                            "typeDescriptions": {
                                                                "typeIdentifier": "t_type$_t_super$_Erc20VotesControlled_$985_$",
                                                                "typeString": "type(contract super Erc20VotesControlled)"
                                                            }
                                                        },
                                                        "id": 948,
                                                        "isConstant": false,
                                                        "isLValue": false,
                                                        "isPure": false,
                                                        "lValueRequested": false,
                                                        "memberLocation": "1119:9:5",
                                                        "memberName": "balanceOf",
                                                        "nodeType": "MemberAccess",
                                                        "referencedDeclaration": 211,
                                                        "src": "1113:15:5",
                                                        "typeDescriptions": {
                                                            "typeIdentifier": "t_function_internal_view$_t_address_$returns$_t_uint256_$",
                                                            "typeString": "function (address) view returns (uint256)"
                                                        }
                                                    },
                                                    "id": 950,
                                                    "isConstant": false,
                                                    "isLValue": false,
                                                    "isPure": false,
                                                    "kind": "functionCall",
                                                    "lValueRequested": false,
                                                    "nameLocations": [],
                                                    "names": [],
                                                    "nodeType": "FunctionCall",
                                                    "src": "1113:19:5",
                                                    "tryCall": false,
                                                    "typeDescriptions": {
                                                        "typeIdentifier": "t_uint256",
                                                        "typeString": "uint256"
                                                    }
                                                }
                                            ],
                                            "expression": {
                                                "argumentTypes": [
                                                    {
                                                        "typeIdentifier": "t_uint256",
                                                        "typeString": "uint256"
                                                    }
                                                ],
                                                "id": 946,
                                                "isConstant": false,
                                                "isLValue": false,
                                                "isPure": true,
                                                "lValueRequested": false,
                                                "nodeType": "ElementaryTypeNameExpression",
                                                "src": "1106:6:5",
                                                "typeDescriptions": {
                                                    "typeIdentifier": "t_type$_t_int256_$",
                                                    "typeString": "type(int256)"
                                                },
                                                "typeName": {
                                                    "id": 945,
                                                    "name": "int256",
                                                    "nodeType": "ElementaryTypeName",
                                                    "src": "1106:6:5",
                                                    "typeDescriptions": {}
                                                }
                                            },
                                            "id": 951,
                                            "isConstant": false,
                                            "isLValue": false,
                                            "isPure": false,
                                            "kind": "typeConversion",
                                            "lValueRequested": false,
                                            "nameLocations": [],
                                            "names": [],
                                            "nodeType": "FunctionCall",
                                            "src": "1106:27:5",
                                            "tryCall": false,
                                            "typeDescriptions": {
                                                "typeIdentifier": "t_int256",
                                                "typeString": "int256"
                                            }
                                        },
                                        "src": "1085:48:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_int256",
                                            "typeString": "int256"
                                        }
                                    },
                                    "nodeType": "VariableDeclarationStatement",
                                    "src": "1070:63:5"
                                },
                                {
                                    "condition": {
                                        "commonType": {
                                            "typeIdentifier": "t_int256",
                                            "typeString": "int256"
                                        },
                                        "id": 956,
                                        "isConstant": false,
                                        "isLValue": false,
                                        "isPure": false,
                                        "lValueRequested": false,
                                        "leftExpression": {
                                            "id": 954,
                                            "name": "delta",
                                            "nodeType": "Identifier",
                                            "overloadedDeclarations": [],
                                            "referencedDeclaration": 940,
                                            "src": "1143:5:5",
                                            "typeDescriptions": {
                                                "typeIdentifier": "t_int256",
                                                "typeString": "int256"
                                            }
                                        },
                                        "nodeType": "BinaryOperation",
                                        "operator": ">",
                                        "rightExpression": {
                                            "hexValue": "30",
                                            "id": 955,
                                            "isConstant": false,
                                            "isLValue": false,
                                            "isPure": true,
                                            "kind": "number",
                                            "lValueRequested": false,
                                            "nodeType": "Literal",
                                            "src": "1151:1:5",
                                            "typeDescriptions": {
                                                "typeIdentifier": "t_rational_0_by_1",
                                                "typeString": "int_const 0"
                                            },
                                            "value": "0"
                                        },
                                        "src": "1143:9:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_bool",
                                            "typeString": "bool"
                                        }
                                    },
                                    "id": 966,
                                    "nodeType": "IfStatement",
                                    "src": "1139:55:5",
                                    "trueBody": {
                                        "id": 965,
                                        "nodeType": "Block",
                                        "src": "1154:40:5",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [
                                                        {
                                                            "id": 958,
                                                            "name": "to",
                                                            "nodeType": "Identifier",
                                                            "overloadedDeclarations": [],
                                                            "referencedDeclaration": 930,
                                                            "src": "1168:2:5",
                                                            "typeDescriptions": {
                                                                "typeIdentifier": "t_address",
                                                                "typeString": "address"
                                                            }
                                                        },
                                                        {
                                                            "arguments": [
                                                                {
                                                                    "id": 961,
                                                                    "name": "delta",
                                                                    "nodeType": "Identifier",
                                                                    "overloadedDeclarations": [],
                                                                    "referencedDeclaration": 940,
                                                                    "src": "1180:5:5",
                                                                    "typeDescriptions": {
                                                                        "typeIdentifier": "t_int256",
                                                                        "typeString": "int256"
                                                                    }
                                                                }
                                                            ],
                                                            "expression": {
                                                                "argumentTypes": [
                                                                    {
                                                                        "typeIdentifier": "t_int256",
                                                                        "typeString": "int256"
                                                                    }
                                                                ],
                                                                "id": 960,
                                                                "isConstant": false,
                                                                "isLValue": false,
                                                                "isPure": true,
                                                                "lValueRequested": false,
                                                                "nodeType": "ElementaryTypeNameExpression",
                                                                "src": "1172:7:5",
                                                                "typeDescriptions": {
                                                                    "typeIdentifier": "t_type$_t_uint256_$",
                                                                    "typeString": "type(uint256)"
                                                                },
                                                                "typeName": {
                                                                    "id": 959,
                                                                    "name": "uint256",
                                                                    "nodeType": "ElementaryTypeName",
                                                                    "src": "1172:7:5",
                                                                    "typeDescriptions": {}
                                                                }
                                                            },
                                                            "id": 962,
                                                            "isConstant": false,
                                                            "isLValue": false,
                                                            "isPure": false,
                                                            "kind": "typeConversion",
                                                            "lValueRequested": false,
                                                            "nameLocations": [],
                                                            "names": [],
                                                            "nodeType": "FunctionCall",
                                                            "src": "1172:14:5",
                                                            "tryCall": false,
                                                            "typeDescriptions": {
                                                                "typeIdentifier": "t_uint256",
                                                                "typeString": "uint256"
                                                            }
                                                        }
                                                    ],
                                                    "expression": {
                                                        "argumentTypes": [
                                                            {
                                                                "typeIdentifier": "t_address",
                                                                "typeString": "address"
                                                            },
                                                            {
                                                                "typeIdentifier": "t_uint256",
                                                                "typeString": "uint256"
                                                            }
                                                        ],
                                                        "id": 957,
                                                        "name": "_mint",
                                                        "nodeType": "Identifier",
                                                        "overloadedDeclarations": [],
                                                        "referencedDeclaration": 516,
                                                        "src": "1162:5:5",
                                                        "typeDescriptions": {
                                                            "typeIdentifier": "t_function_internal_nonpayable$_t_address_$_t_uint256_$returns$__$",
                                                            "typeString": "function (address,uint256)"
                                                        }
                                                    },
                                                    "id": 963,
                                                    "isConstant": false,
                                                    "isLValue": false,
                                                    "isPure": false,
                                                    "kind": "functionCall",
                                                    "lValueRequested": false,
                                                    "nameLocations": [],
                                                    "names": [],
                                                    "nodeType": "FunctionCall",
                                                    "src": "1162:25:5",
                                                    "tryCall": false,
                                                    "typeDescriptions": {
                                                        "typeIdentifier": "t_tuple$__$",
                                                        "typeString": "tuple()"
                                                    }
                                                },
                                                "id": 964,
                                                "nodeType": "ExpressionStatement",
                                                "src": "1162:25:5"
                                            }
                                        ]
                                    }
                                },
                                {
                                    "condition": {
                                        "commonType": {
                                            "typeIdentifier": "t_int256",
                                            "typeString": "int256"
                                        },
                                        "id": 969,
                                        "isConstant": false,
                                        "isLValue": false,
                                        "isPure": false,
                                        "lValueRequested": false,
                                        "leftExpression": {
                                            "id": 967,
                                            "name": "delta",
                                            "nodeType": "Identifier",
                                            "overloadedDeclarations": [],
                                            "referencedDeclaration": 940,
                                            "src": "1203:5:5",
                                            "typeDescriptions": {
                                                "typeIdentifier": "t_int256",
                                                "typeString": "int256"
                                            }
                                        },
                                        "nodeType": "BinaryOperation",
                                        "operator": "<",
                                        "rightExpression": {
                                            "hexValue": "30",
                                            "id": 968,
                                            "isConstant": false,
                                            "isLValue": false,
                                            "isPure": true,
                                            "kind": "number",
                                            "lValueRequested": false,
                                            "nodeType": "Literal",
                                            "src": "1211:1:5",
                                            "typeDescriptions": {
                                                "typeIdentifier": "t_rational_0_by_1",
                                                "typeString": "int_const 0"
                                            },
                                            "value": "0"
                                        },
                                        "src": "1203:9:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_bool",
                                            "typeString": "bool"
                                        }
                                    },
                                    "id": 980,
                                    "nodeType": "IfStatement",
                                    "src": "1199:56:5",
                                    "trueBody": {
                                        "id": 979,
                                        "nodeType": "Block",
                                        "src": "1214:41:5",
                                        "statements": [
                                            {
                                                "expression": {
                                                    "arguments": [
                                                        {
                                                            "id": 971,
                                                            "name": "to",
                                                            "nodeType": "Identifier",
                                                            "overloadedDeclarations": [],
                                                            "referencedDeclaration": 930,
                                                            "src": "1228:2:5",
                                                            "typeDescriptions": {
                                                                "typeIdentifier": "t_address",
                                                                "typeString": "address"
                                                            }
                                                        },
                                                        {
                                                            "arguments": [
                                                                {
                                                                    "id": 975,
                                                                    "isConstant": false,
                                                                    "isLValue": false,
                                                                    "isPure": false,
                                                                    "lValueRequested": false,
                                                                    "nodeType": "UnaryOperation",
                                                                    "operator": "-",
                                                                    "prefix": true,
                                                                    "src": "1240:6:5",
                                                                    "subExpression": {
                                                                        "id": 974,
                                                                        "name": "delta",
                                                                        "nodeType": "Identifier",
                                                                        "overloadedDeclarations": [],
                                                                        "referencedDeclaration": 940,
                                                                        "src": "1241:5:5",
                                                                        "typeDescriptions": {
                                                                            "typeIdentifier": "t_int256",
                                                                            "typeString": "int256"
                                                                        }
                                                                    },
                                                                    "typeDescriptions": {
                                                                        "typeIdentifier": "t_int256",
                                                                        "typeString": "int256"
                                                                    }
                                                                }
                                                            ],
                                                            "expression": {
                                                                "argumentTypes": [
                                                                    {
                                                                        "typeIdentifier": "t_int256",
                                                                        "typeString": "int256"
                                                                    }
                                                                ],
                                                                "id": 973,
                                                                "isConstant": false,
                                                                "isLValue": false,
                                                                "isPure": true,
                                                                "lValueRequested": false,
                                                                "nodeType": "ElementaryTypeNameExpression",
                                                                "src": "1232:7:5",
                                                                "typeDescriptions": {
                                                                    "typeIdentifier": "t_type$_t_uint256_$",
                                                                    "typeString": "type(uint256)"
                                                                },
                                                                "typeName": {
                                                                    "id": 972,
                                                                    "name": "uint256",
                                                                    "nodeType": "ElementaryTypeName",
                                                                    "src": "1232:7:5",
                                                                    "typeDescriptions": {}
                                                                }
                                                            },
                                                            "id": 976,
                                                            "isConstant": false,
                                                            "isLValue": false,
                                                            "isPure": false,
                                                            "kind": "typeConversion",
                                                            "lValueRequested": false,
                                                            "nameLocations": [],
                                                            "names": [],
                                                            "nodeType": "FunctionCall",
                                                            "src": "1232:15:5",
                                                            "tryCall": false,
                                                            "typeDescriptions": {
                                                                "typeIdentifier": "t_uint256",
                                                                "typeString": "uint256"
                                                            }
                                                        }
                                                    ],
                                                    "expression": {
                                                        "argumentTypes": [
                                                            {
                                                                "typeIdentifier": "t_address",
                                                                "typeString": "address"
                                                            },
                                                            {
                                                                "typeIdentifier": "t_uint256",
                                                                "typeString": "uint256"
                                                            }
                                                        ],
                                                        "id": 970,
                                                        "name": "_burn",
                                                        "nodeType": "Identifier",
                                                        "overloadedDeclarations": [],
                                                        "referencedDeclaration": 588,
                                                        "src": "1222:5:5",
                                                        "typeDescriptions": {
                                                            "typeIdentifier": "t_function_internal_nonpayable$_t_address_$_t_uint256_$returns$__$",
                                                            "typeString": "function (address,uint256)"
                                                        }
                                                    },
                                                    "id": 977,
                                                    "isConstant": false,
                                                    "isLValue": false,
                                                    "isPure": false,
                                                    "kind": "functionCall",
                                                    "lValueRequested": false,
                                                    "nameLocations": [],
                                                    "names": [],
                                                    "nodeType": "FunctionCall",
                                                    "src": "1222:26:5",
                                                    "tryCall": false,
                                                    "typeDescriptions": {
                                                        "typeIdentifier": "t_tuple$__$",
                                                        "typeString": "tuple()"
                                                    }
                                                },
                                                "id": 978,
                                                "nodeType": "ExpressionStatement",
                                                "src": "1222:26:5"
                                            }
                                        ]
                                    }
                                },
                                {
                                    "expression": {
                                        "hexValue": "74727565",
                                        "id": 981,
                                        "isConstant": false,
                                        "isLValue": false,
                                        "isPure": true,
                                        "kind": "bool",
                                        "lValueRequested": false,
                                        "nodeType": "Literal",
                                        "src": "1267:4:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_bool",
                                            "typeString": "bool"
                                        },
                                        "value": "true"
                                    },
                                    "functionReturnParameters": 938,
                                    "id": 982,
                                    "nodeType": "Return",
                                    "src": "1260:11:5"
                                }
                            ]
                        },
                        "functionSelector": "40615cf8",
                        "id": 984,
                        "implemented": true,
                        "kind": "function",
                        "modifiers": [
                            {
                                "id": 935,
                                "kind": "modifierInvocation",
                                "modifierName": {
                                    "id": 934,
                                    "name": "onlyOwner",
                                    "nameLocations": [
                                        "1039:9:5"
                                    ],
                                    "nodeType": "IdentifierPath",
                                    "referencedDeclaration": 31,
                                    "src": "1039:9:5"
                                },
                                "nodeType": "ModifierInvocation",
                                "src": "1039:9:5"
                            }
                        ],
                        "name": "allot",
                        "nameLocation": "994:5:5",
                        "nodeType": "FunctionDefinition",
                        "parameters": {
                            "id": 933,
                            "nodeType": "ParameterList",
                            "parameters": [
                                {
                                    "constant": false,
                                    "id": 930,
                                    "mutability": "mutable",
                                    "name": "to",
                                    "nameLocation": "1008:2:5",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 984,
                                    "src": "1000:10:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_address",
                                        "typeString": "address"
                                    },
                                    "typeName": {
                                        "id": 929,
                                        "name": "address",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "1000:7:5",
                                        "stateMutability": "nonpayable",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_address",
                                            "typeString": "address"
                                        }
                                    },
                                    "visibility": "internal"
                                },
                                {
                                    "constant": false,
                                    "id": 932,
                                    "mutability": "mutable",
                                    "name": "newBalance",
                                    "nameLocation": "1020:10:5",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 984,
                                    "src": "1012:18:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_uint256",
                                        "typeString": "uint256"
                                    },
                                    "typeName": {
                                        "id": 931,
                                        "name": "uint256",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "1012:7:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_uint256",
                                            "typeString": "uint256"
                                        }
                                    },
                                    "visibility": "internal"
                                }
                            ],
                            "src": "999:32:5"
                        },
                        "returnParameters": {
                            "id": 938,
                            "nodeType": "ParameterList",
                            "parameters": [
                                {
                                    "constant": false,
                                    "id": 937,
                                    "mutability": "mutable",
                                    "name": "",
                                    "nameLocation": "-1:-1:-1",
                                    "nodeType": "VariableDeclaration",
                                    "scope": 984,
                                    "src": "1058:4:5",
                                    "stateVariable": false,
                                    "storageLocation": "default",
                                    "typeDescriptions": {
                                        "typeIdentifier": "t_bool",
                                        "typeString": "bool"
                                    },
                                    "typeName": {
                                        "id": 936,
                                        "name": "bool",
                                        "nodeType": "ElementaryTypeName",
                                        "src": "1058:4:5",
                                        "typeDescriptions": {
                                            "typeIdentifier": "t_bool",
                                            "typeString": "bool"
                                        }
                                    },
                                    "visibility": "internal"
                                }
                            ],
                            "src": "1057:6:5"
                        },
                        "scope": 985,
                        "src": "985:291:5",
                        "stateMutability": "nonpayable",
                        "virtual": false,
                        "visibility": "public"
                    }
                ],
                "scope": 986,
                "src": "176:1105:5",
                "usedErrors": [
                    834
                ]
            }
        ],
        "src": "32:1250:5"
    },
    "compiler": {
        "name": "solc",
        "version": "0.8.19+commit.7dd6d404.Emscripten.clang"
    },
    "networks": {},
    "schemaVersion": "3.4.14",
    "updatedAt": "2023-07-22T18:24:13.335Z",
    "devdoc": {
        "events": {
            "Approval(address,address,uint256)": {
                "details": "Emitted when the allowance of a `spender` for an `owner` is set by a call to {approve}. `value` is the new allowance."
            },
            "Transfer(address,address,uint256)": {
                "details": "Emitted when `value` tokens are moved from one account (`from`) to another (`to`). Note that `value` may be zero."
            }
        },
        "kind": "dev",
        "methods": {
            "balanceOf(address)": {
                "details": "See {IERC20-balanceOf}."
            },
            "decimals()": {
                "details": "Returns the number of decimals used to get its user representation. For example, if `decimals` equals `2`, a balance of `505` tokens should be displayed to a user as `5.05` (`505 / 10 ** 2`). Tokens usually opt for a value of 18, imitating the relationship between Ether and Wei. This is the default value returned by this function, unless it's overridden. NOTE: This information is only used for _display_ purposes: it in no way affects any of the arithmetic of the contract, including {IERC20-balanceOf} and {IERC20-transfer}."
            },
            "decreaseAllowance(address,uint256)": {
                "details": "Atomically decreases the allowance granted to `spender` by the caller. This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}. Emits an {Approval} event indicating the updated allowance. Requirements: - `spender` cannot be the zero address. - `spender` must have allowance for the caller of at least `subtractedValue`."
            },
            "increaseAllowance(address,uint256)": {
                "details": "Atomically increases the allowance granted to `spender` by the caller. This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}. Emits an {Approval} event indicating the updated allowance. Requirements: - `spender` cannot be the zero address."
            },
            "name()": {
                "details": "Returns the name of the token."
            },
            "owner()": {
                "details": "Returns the address of the current owner."
            },
            "renounceOwnership()": {
                "details": "Leaves the contract without owner. It will not be possible to call `onlyOwner` functions. Can only be called by the current owner. NOTE: Renouncing ownership will leave the contract without an owner, thereby disabling any functionality that is only available to the owner."
            },
            "symbol()": {
                "details": "Returns the symbol of the token, usually a shorter version of the name."
            },
            "totalSupply()": {
                "details": "See {IERC20-totalSupply}."
            },
            "transferOwnership(address)": {
                "details": "Transfers ownership of the contract to a new account (`newOwner`). Can only be called by the current owner."
            }
        },
        "version": 1
    },
    "userdoc": {
        "kind": "user",
        "methods": {},
        "version": 1
    }
}