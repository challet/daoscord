import {Client, CommandInteraction} from "discord.js";
import {provideCommands} from "./commands/command-provider";
import {DaoService} from "./dao/dao-service";

export class DaoscordClient {

    private daoService: DaoService

    constructor(private discordClient: Client, ) {
        this.daoService = new DaoService()
    }

    public init() {
        this.discordClient.on('ready', this.onReady)
        this.discordClient.on('interactionCreate', this.onInteractionCreate)
    }

    private async onReady() {
        const commands = provideCommands()
        for (const command of commands) {
            await this.discordClient.application.commands.create(command)
        }
    }

    private async onInteractionCreate(interaction: CommandInteraction) {
        if (interaction.commandName === 'dao') {
            await this.daoService.create(interaction)
        }
    }
}