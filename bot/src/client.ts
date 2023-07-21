import {Client, CommandInteraction} from "discord.js";
import {provideCommands} from "./commands/command-provider";
import {DaoService} from "./dao/dao-service";
import {getDb} from "./database/db-manager";
import {ProposalService} from "./proposal/proposal-service";

export class DaoscordClient {

    private daoService: DaoService
    private proposalService: ProposalService

    constructor(private discordClient: Client, ) {
        this.daoService = new DaoService()
        this.proposalService = new ProposalService()
    }

    public async init() {
        const db = await getDb()
        this.discordClient.on('ready', this.onReady)
        this.discordClient.on('interactionCreate', this.onInteractionCreate)
    }

    public async createProposal(title: string, description: string, endDate?: Date): Promise<string> {
        return await this.proposalService.createProposal(title, description, endDate)
    }

    private async onReady() {
        const commands = provideCommands()
        for (const command of commands) {
            await this.discordClient.application.commands.create(command)
        }
    }

    private async onInteractionCreate(interaction: CommandInteraction) {
        if (interaction.commandName === 'dao') {
            switch (interaction.options.getSubcommand()) {
                case 'create':
                    await this.daoService.create(interaction)
                    break
                case 'start-proposal':
                    await this.proposalService.createInteractiveProposal(interaction)
                    break
                default:
                    await interaction.reply('Unknown subcommand')
                    break
            }
        }
    }
}