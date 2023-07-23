# Daoscord
**The easiest and most convenient way to decentralize your Discord server!**

### What is Daoscord?
Demeter, a Discord bot, has been an integral part of the DeFi France community for the past two years.
Members earn reputation points every two weeks based on their activity, which can be used for voting, moderating, giveaways, and more within the community.
The reputation points are calculated using the "quadratic voting" algorithm, similar to Gitcoin, which ensures a more equitable and fair outcome.

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