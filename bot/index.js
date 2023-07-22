import 'dotenv/config';
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits
} from 'discord.js';
import commandsConfig from './commandsConfig.js';
import commandsProcessors from './commands/index.js';



try {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.commands = new Collection();
  commandsConfig.options.forEach(sub => {
    client.commands.set(sub.name, commandsProcessors[sub.name])
  })

  client.on(Events.InteractionCreate, async interaction => {
    
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.commandName === 'dao') return;

    
    const command = interaction.client.commands.get(interaction.options.getSubcommand());

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
      }
    }
  });
  
  client.once(Events.ClientReady, c => {
  	console.log(`Ready! Logged in as ${c.user.tag} handling the following commands`);
    console.dir(commandsConfig)
  });
  
  client.login(process.env.DISCORD_BOT_TOKEN);
  
} catch(e) {
  console.error(e)
}