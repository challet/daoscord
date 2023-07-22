import {CommandInteraction} from "discord.js";
import {DaoService} from "../dao/dao-service";

export class CommandHandler {

    private daoFactory: DaoService;
    constructor() {
        this.daoFactory = new DaoService()
    }

    public async handle(interaction: CommandInteraction) {
        if (interaction.commandName === 'dao') {
            if (interaction.options.getSubcommand() === 'create') {
                await this.daoFactory.create(interaction)
            }
        }
    }
}