
const {
  Client,
  GatewayIntentBits,
  Events,
  PermissionFlagsBits
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

let data = {};
if (fs.existsSync(FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    data = {};
  }
}

const messageCooldown = new Map();
const activeVoice = new Map();

function saveData() {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function getUser(guildId, userId) {
  const key = `${guildId}_${userId}`;

  if (!data[key]) {
    data[key] = {
      xp: 0,
      messages: 0,
      vcSeconds: 0,
      vcProgress: 0
    };
  }

  return data[key];
}

function levelFromXP(xp) {
  return Math.floor(Math.sqrt(xp / 100));
}

function addVoiceTime(guildId, userId, seconds) {
  const user = getUser(guildId, userId);

  user.vcSeconds += seconds;
  user.vcProgress += seconds;

  const earned = Math.floor(user.vcProgress / 300);
  if (earned > 0) {
    user.xp += earned * 10;
    user.vcProgress %= 300;
  }
}

function updateVoice(key) {
  const last = activeVoice.get(key);
  if (!last) return;

  const now = Date.now();
  const seconds = Math.floor((now - last) / 1000);

  if (seconds > 0) {
    const [guildId, userId] = key.split("_");
    addVoiceTime(guildId, userId, seconds);
    activeVoice.set(key, last + seconds * 1000);
  }
}

function userOption(name = "user") {
  return {
    name,
    description: "Select a member",
    type: 6,
    required: false
  };
}

function amountOption(name, description) {
  return {
    name,
    description,
    type: 4,
    required: true,
    min_value: 0
  };
}

const commands = [
  { name: "ping", description: "Check bot latency" },
  { name: "help", description: "Show all bot commands" },
  {
    name: "rank",
    description: "Check XP and level",
    options: [userOption()]
  },
  {
    name: "leaderboard",
    description: "Show top 10 XP members"
  },
  {
    name: "vcstats",
    description: "Check voice channel time",
    options: [userOption()]
  },
  {
    name: "addxp",
    description: "Add XP to a member",
    options: [
      { ...userOption(), required: true },
      amountOption("amount", "XP to add")
    ]
  },
  {
    name: "setxp",
    description: "Set a member's XP",
    options: [
      { ...userOption(), required: true },
      amountOption("amount", "New total XP")
    ]
  },
  {
    name: "addvc",
    description: "Add voice time in minutes",
    options: [
      { ...userOption(), required: true },
      amountOption("minutes", "Minutes to add")
    ]
  },
  {
    name: "setvc",
    description: "Set voice time in minutes",
    options: [
      { ...userOption(), required: true },
      amountOption("minutes", "New total minutes")
    ]
  }
];

client.once(Events.ClientReady, async (bot) => {
  console.log(`${bot.user.tag} is online!`);

  try {
    await client.application.commands.set(commands);
    console.log("BILLA BOT commands registered!");
  } catch (error) {
    console.error("Command registration failed:", error);
  }

  for (const guild of client.guilds.cache.values()) {
    for (const state of guild.voiceStates.cache.values()) {
      if (state.channelId && state.member && !state.member.user.bot) {
        activeVoice.set(
          `${guild.id}_${state.id}`,
          Date.now()
        );
      }
    }
  }

  setInterval(() => {
    for (const key of activeVoice.keys()) {
      updateVoice(key);
    }
    saveData();
  }, 60000);
});

// Automatic message XP
client.on(Events.MessageCreate, (message) => {
  if (!message.guild || message.author.bot) return;

  const key = `${message.guild.id}_${message.author.id}`;
  const now = Date.now();

  if (now - (messageCooldown.get(key) || 0) < 60000) return;

  messageCooldown.set(key, now);

  const user = getUser(message.guild.id, message.author.id);
  user.xp += Math.floor(Math.random() * 11) + 5;
  user.messages++;

  saveData();
});

// Automatic voice tracking
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const key = `${newState.guild.id}_${member.id}`;

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    updateVoice(key);
    activeVoice.delete(key);
  }

  if (newState.channelId && oldState.channelId !== newState.channelId) {
    activeVoice.set(key, Date.now());
  }

  saveData();
});

// Slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;

  const guildId = interaction.guild.id;
  const target = interaction.options.getUser("user") || interaction.user;
  const user = getUser(guildId, target.id);
  const command = interaction.commandName;

  try {
    if (command === "ping") {
      return interaction.reply(`Pong! ${client.ws.ping}ms`);
    }

    if (command === "help") {
      return interaction.reply(
        "**BILLA BOT COMMANDS**\n" +
        "`/ping` - Bot latency\n" +
        "`/rank` - XP and level\n" +
        "`/leaderboard` - Top XP members\n" +
        "`/vcstats` - Voice time\n" +
        "`/addxp` - Add XP (Admin)\n" +
        "`/setxp` - Set XP (Admin)\n" +
        "`/addvc` - Add VC minutes (Admin)\n" +
        "`/setvc` - Set VC minutes (Admin)"
      );
    }

    if (command === "rank") {
      return interaction.reply(
        `**${target.username}'s Rank**\n` +
        `Level: ${levelFromXP(user.xp)}\n` +
        `XP: ${user.xp}\n` +
        `Messages: ${user.messages}`
      );
    }

    if (command === "vcstats") {
      updateVoice(`${guildId}_${target.id}`);

      const hours = Math.floor(user.vcSeconds / 3600);
      const minutes = Math.floor((user.vcSeconds % 3600) / 60);

      return interaction.reply(
        `**${target.username}'s VC Stats**\n` +
        `Time: ${hours}h ${minutes}m`
      );
    }

    if (command === "leaderboard") {
      const prefix = `${guildId}_`;

      const top = Object.entries(data)
        .filter(([key]) => key.startsWith(prefix))
        .sort((a, b) => b[1].xp - a[1].xp)
        .slice(0, 10);

      if (!top.length) {
        return interaction.reply("No XP data yet!");
      }

      const result = top.map(([key, value], index) => {
        const userId = key.slice(prefix.length);
        return `${index + 1}. <@${userId}> — ${value.xp} XP`;
      });

      return interaction.reply(result.join("\n"));
    }

    const adminCommands = ["addxp", "setxp", "addvc", "setvc"];

    if (adminCommands.includes(command)) {
      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator
      )) {
        return interaction.reply({
          content: "You need Administrator permission to use this command.",
          ephemeral: true
        });
      }

      const amount = interaction.options.getInteger(
        command.endsWith("vc") ? "minutes" : "amount"
      );

      if (!Number.isSafeInteger(amount) || amount < 0) {
        return interaction.reply({
          content: "Please enter a valid non-negative number.",
          ephemeral: true
        });
      }

      if (command === "addxp") user.xp += amount;
      if (command === "setxp") user.xp = amount;

      if (command === "addvc") {
        user.vcSeconds += amount * 60;
      }

      if (command === "setvc") {
        user.vcSeconds = amount * 60;
        user.vcProgress = 0;
      }

      saveData();

      return interaction.reply(
        `Updated **${target.username}** successfully.\n` +
        `XP: ${user.xp}\n` +
        `VC Time: ${Math.floor(user.vcSeconds / 60)} minutes`
      );
    }
  } catch (error) {
    console.error(error);

    const reply = {
      content: "Something went wrong. Please try again.",
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(reply);
    }

    return interaction.reply(reply);
  }
});

client.login(process.env.DISCORD_TOKEN);
          
