import {CommandInteraction} from "discord.js";
import {client} from "../aragon/client-provider";
import {
    CreateDaoParams, DaoCreationSteps,
    DaoMetadata,
    TokenVotingClient,
    TokenVotingPluginInstall,
    VotingMode
} from "@aragon/sdk-client";
import {TokenService} from "../token/token-service";
import {getDb} from "../database/db-manager";

export class DaoService {

    private tokenService: TokenService

    constructor() {
        this.tokenService = new TokenService()
    }

    public async create(interaction: CommandInteraction) {
        await interaction?.deferReply({ephemeral: true})
        const name = interaction.options.getString('name')
        const metadata: DaoMetadata = {
            name: name,
            description: "DAO created with Daoscord",
            avatar: "https://img.freepik.com/vecteurs-premium/deesse-demeter_175624-68.jpg?w=826",
            links: [{
                name: "Github repository",
                url: "https://github.com/challet/daoscord",
            }],
        };
        const metadataUri = await client.methods.pinMetadata(metadata);
        const tokenVotingPluginInstallParams: TokenVotingPluginInstall = {
            votingSettings: {
                minDuration: 60, // seconds
                minParticipation: 0.25, // 25%
                supportThreshold: 0.5, // 50%
                minProposerVotingPower: BigInt("1"), // default 0
                votingMode: VotingMode.EARLY_EXECUTION, // default is STANDARD. other options: EARLY_EXECUTION, VOTE_REPLACEMENT
            },
            useToken: {
                tokenAddress: await this.tokenService.deployToken(),
                wrappedToken: {
                    name: 'DeFi France',
                    symbol: 'DFF'
                }
            }
        };

        const tokenVotingInstallItem = TokenVotingClient.encoding
            .getPluginInstallItem(tokenVotingPluginInstallParams);

        const createDaoParams: CreateDaoParams = {
            metadataUri,
            ensSubdomain: "defi-france.eth",
            plugins: [tokenVotingInstallItem], // plugin array cannot be empty or the transaction will fail. you need at least one governance mechanism to create your DAO.
        };

        const db = await getDb()
        const steps = client.methods.createDao(createDaoParams);
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
                        db.data.guildUuid = interaction.guildId
                        db.data.daoAddress = step.address
                        db.data.tokenVotingPluginAddress = step.pluginAddresses[0]
                        await interaction.reply(`Created DAO at ${step.address}!`)
                        break;
                }
            } catch (err) {
                console.error(err);
            }
        }
        await db.write()
    }
    
    
    public async join(interaction: CommandInteraction) {
    
    
    }
}