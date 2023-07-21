import {ApplicationCommandOptionTypes} from "discord.js/typings/enums";
import {ApplicationCommandDataResolvable} from "discord.js";

export const provideCommands = (): [ApplicationCommandDataResolvable] => {
    return [
        {
            name: 'dao',
            description: 'Manage the DAO',
            options: [
                {
                    type: ApplicationCommandOptionTypes.SUB_COMMAND,
                    name: 'create',
                    description: 'Create the dao',
                    options: [
                        {
                            type: ApplicationCommandOptionTypes.STRING,
                            name: 'name',
                            description: 'Name of the DAO'
                        },
                    ]
                },
            ]
        }
    ] as [ApplicationCommandDataResolvable]
}