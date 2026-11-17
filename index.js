
const {
  Client,
  GatewayIntentBits,
  Events
} = require("discord.js");

const fs = require("fs");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const FILE = "./data.json";

let data = fs.existsSync(FILE)
  ? JSON.parse(fs.readFileSync(FILE, "utf8"))
  : {};

const activeVoice = new Map();
const voiceMinutes = new Map();
const chatCooldown = new Map();

function saveData() {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function getUser(guildId, userId) {
  const key = `${guildId}_${userId}`;

  if (!data[key]) {
    data[key] = {
      xp: 0,
      messages: 0,
      vcSeconds: 0
    };
  }

  return data[key];
}

function levelFromXP(xp) {
  return Math.floor(Math.sqrt(xp / 100));
}

const commands = [
  { name: "ping", description: "Check bot latency" },
  { name: "help", description: "Show BILLA BOT commands" },
  {
    name: "rank",
    description: "Check your XP and level",
    options: [{
      name: "user",
      description: "Select a member",
      type: 6,
      required: false
    }]
  },
  {
    name: "leaderboard",
    description: "Show server XP leaderboard"
  },
  {
    name: "vcstats",
    description: "Check voice channel time",
    options: [{
      name: "user",
      description: "Select a member",
      type: 6,
      required: false
    }]
  }
];

client.once(Events.ClientReady, async (bot) => {
  console.log(`${bot.user.tag} is online!`);

  await client.application.commands.set(commands);
  console.log("BILLA BOT commands registered!");

  for (const guild of client.guilds.cache.values()) {
    for (const state of guild.voiceStates.cache.values()) {
      if (state.channelId && !state.member?.user.bot) {
        activeVoice.set(
          `${guild.id}_${state.id}`,
          Date.now()
        );
      }
    }
  }
});

client.on(Events.MessageCreate, (message) => {
  if (!message.guild || message.author.bot) return;

  const key = `${message.guild.id}_${message.author.id}`;
  const now = Date.now();

  if (now - (chatCooldown.get(key) || 0) < 60000) return;

  chatCooldown.set(key, now);

  const user = getUser(message.guild.id, message.author.id);
  user.xp += Math.floor(Math.random() * 11) + 5;
  user.messages++;

  saveData();
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const key = `${newState.guild.id}_${member.id}`;

  if (oldState.channelId && !newState.channelId) {
    activeVoice.delete(key);
    voiceMinutes.delete(key);
  } else if (!oldState.channelId && newState.channelId) {
    activeVoice.set(key, Date.now());
    voiceMinutes.set(key, 0);
  } else if (oldState.channelId !== newState.channelId) {
    activeVoice.set(key, Date.now());
  }
});

setInterval(() => {
  for (const key of activeVoice.keys()) {
    const [guildId, userId] = key.split("_");
    const user = getUser(guildId, userId);

    user.vcSeconds += 60;

    const minutes = (voiceMinutes.get(key) || 0) + 1;

    if (minutes >= 5) {
      user.xp += 10;
      voiceMinutes.set(key, 0);
    } else {
      voiceMinutes.set(key, minutes);
    }
  }

  saveData();
}, 60000);

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guildId;
  const target = interaction.options.getUser("user") || interaction.user;
  const user = getUser(guildId, target.id);

  if (interaction.commandName === "ping") {
    return interaction.reply(
      `Pong! ${client.ws.ping}ms`
    );
  }

  if (interaction.commandName === "help") {
    return interaction.reply(
      "**BILLA BOT COMMANDS**\n" +
      "`/ping` — Bot latency\n" +
      "`/rank` — XP and level\n" +
      "`/leaderboard` — Top members\n" +
      "`/vcstats` — Voice time"
    );
  }

  if (interaction.commandName === "rank") {
    return interaction.reply(
      `**${target.username}'s Rank**\n` +
      `Level: ${levelFromXP(user.xp)}\n` +
      `XP: ${user.xp}\n` +
      `Messages: ${user.messages}`
    );
  }

  if (interaction.commandName === "vcstats") {
    const hours = Math.floor(user.vcSeconds / 3600);
    const minutes = Math.floor((user.vcSeconds % 3600) / 60);

    return interaction.reply(
      `**${target.username}'s VC Stats**\n` +
      `Time: ${hours}h ${minutes}m`
    );
  }

  if (interaction.commandName === "leaderboard") {
    const prefix = `${guildId}_`;

    const top = Object.entries(data)
      .filter(([key]) => key.startsWith(prefix))
      .sort((a, b) => b[1].xp - a[1].xp)
      .slice(0, 10);

    const result = top.map(([key, value], index) => {
      const userId = key.slice(prefix.length);
      return `${index + 1}. <@${userId}> — Level ${levelFromXP(value.xp)} (${value.xp} XP)`;
    });

    return interaction.reply(
      result.length ? result.join("\n") : "No XP data yet!"
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
  
