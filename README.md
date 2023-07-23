# Daoscord
**The easiest and most convenient way to decentralize your Discord server!**

### How to install
Import the library in your project:
```npm install daoscord``` or ```yarn add daoscord```.
Then create a web3.storage account and pass the api key when instanciating :
```
const daoscordClient = new DaoscordClient (
        adminPrivateKey,
        rpcUrl,
        web3StorageApiKey
    )
await daoscordClient.init()
  ```

### What is Daoscord?
Demeter, a Discord bot, has been an integral part of the DeFi France community for the past two years.
Members earn reputation points every two weeks based on their activity, which can be used for voting, moderating, giveaways, and more within the community.
The reputation points are calculated using the "quadratic founding" algorithm, similar to Gitcoin, which ensures a more equitable and fair outcome.

Despite decentralizing our decision-making, our tech stack still remains centralized. The bot logic is currently hosted on a single server.
There is always room for improvement, and that was precisely our goal here!

### How does it work?
The solution is a JavaScript library that:
-deploys a DAO and create proposals using Aragon sdk
-deploys a non-transferable ERC20 token which balance can increase or decrease to reflect members reputation
-utilizes Biconomy's Smart Account for efficient transaction bundling
-stores data (SC & members wallet addresses, proposals, etc.) on IPFS
-relies on QuickNode RPC
-delegates the members wallets management to DFNS
-runs on Polygon PoS for scalability and low costs

### Structure
The library is divided into 3 main parts:
* lib - contains the main logic
* contracts - contains the contracts used by the library
* bot - contains an integration example with a Discord bot

### Slides
https://docs.google.com/presentation/d/1TfVOOHe4JgTJirLwrfMeiPgx2XFNUqOTPsyUnFRE6ZI/edit?usp=sharing


### Repository structure

* `web3` holds the custom ERC20Votes contract used to allot voting power to users. It is deployed along the Aragon DAO and its TokenVoting plugin
* `lib` contains the core API to the actions, calling and orchestrating the providers services together
* `bot` is the actual bot implementation. It can be installed on any Discord server