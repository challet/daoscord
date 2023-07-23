import {
  ApplicationCommandOptionType,
  SlashCommandBuilder
} from 'discord.js';

const commands = new SlashCommandBuilder()
  .setName('dao')
  .setDescription('Interacts with the DAO')
  .addSubcommand((sub) => sub
    .setName('create')
    .setDescription('Create the dao')
    .addStringOption((option) => option
      .setName('name')
      .setDescription('Name of the DAO')
      .setRequired(true)
    )
  )
  .addSubcommand((sub) => sub
    .setName('join')
    .setDescription('Register as a DAO user')
  )
  .addSubcommand((sub) => sub
    .setName('whoami')
    .setDescription('Show your DAO user account infos')
  )
  .addSubcommand((sub) => sub
    .setName('start-proposal')
    .setDescription('Start a proposal')
    .addStringOption((option) => option
      .setName('details')
      .setDescription('describe the proposal')
      .setRequired(true)
    )
  )

export default commands