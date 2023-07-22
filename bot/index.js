import 'dotenv/config'
import {
  Client,
  Events,
  GatewayIntentBits
} from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.login(process.env.DISCORD_BOT_TOKEN);

