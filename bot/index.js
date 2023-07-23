import 'dotenv/config';
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits
} from 'discord.js';
import commandsConfig from './commandsConfig.js';
import commandsProcessors from './commands/index.js';

import { DaoscordClient } from '../lib/src/index.js'

const daoClient = new DaoscordClient(process.env.DAO_PRIVATE_KEY, process.env.DAO_RPC_URL, process.env.DAO_WEB3_TOKEN)
daoClient.init().then(() => {
  const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });

  discordClient.commands = new Collection();
  commandsConfig.options.forEach(sub => {
    discordClient.commands.set(sub.name, commandsProcessors[sub.name])
  })

  discordClient.on(Events.InteractionCreate, async interaction => {
  
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.commandName === 'dao') return;

    const command = interaction.client.commands.get(interaction.options.getSubcommand());

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command(interaction, daoClient);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!'});
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!' });
      }
    }
  });

  discordClient.once(Events.ClientReady, c => {
  	console.log(`Ready! Logged in as ${c.user.tag} handling the following commands`);
    console.dir(commandsConfig)
  });

  discordClient.login(process.env.DISCORD_BOT_TOKEN);
})
