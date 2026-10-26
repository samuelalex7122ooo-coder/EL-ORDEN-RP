require("dotenv").config();

const {
  REST, Routes, SlashCommandBuilder, PermissionFlagsBits
} = require("discord.js");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Completa DISCORD_TOKEN, CLIENT_ID y GUILD_ID en .env.");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Comprueba si EL ORDEN RP está conectado"),

  new SlashCommandBuilder()
    .setName("verificacion")
    .setDescription("Publica el panel rojo de verificación")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("✅ Comandos registrados en EL ORDEN RP.");
  } catch (error) {
    console.error("Error registrando comandos:", error.message);
    process.exitCode = 1;
  }
})();
