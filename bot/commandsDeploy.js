import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import commands from './commandsConfig.js';

const rest = new REST({
  timeout: 60 * 10 * 1000
}).setToken(process.env.DISCORD_BOT_TOKEN);

console.log(rest);

(async () => {
  try {
    console.log('Deploying commands to Discord severs')
    console.info(commands.toJSON())
  
    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_APP_ID),
      { body: commands.toJSON() }
    )
    
    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
  
})();
