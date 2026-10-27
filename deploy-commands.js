require("dotenv").config();

const { REST, Routes, SlashCommandBuilder, ChannelType } = require("discord.js");

const commands = [
  new SlashCommandBuilder().setName("configurar-verificacion")
    .setDescription("Selecciona el rol que se asignará al verificar").setDefaultMemberPermissions(null)
    .addRoleOption(o => o.setName("rol").setDescription("Rol para miembros verificados").setRequired(true)),

  new SlashCommandBuilder().setName("editar-panel")
    .setDescription("Personaliza el panel de verificación").setDefaultMemberPermissions(null)
    .addStringOption(o => o.setName("titulo").setDescription("Título del panel").setMaxLength(256))
    .addStringOption(o => o.setName("mensaje").setDescription("Descripción del panel").setMaxLength(4000))
    .addStringOption(o => o.setName("boton").setDescription("Texto del botón").setMaxLength(80))
    .addStringOption(o => o.setName("imagen").setDescription("URL HTTPS o ninguna").setMaxLength(500))
    .addStringOption(o => o.setName("color").setDescription("Color hexadecimal, por ejemplo #3498DB").setMaxLength(7)),

  new SlashCommandBuilder().setName("publicar-verificacion")
    .setDescription("Publica el panel de verificación").setDefaultMemberPermissions(null)
    .addChannelOption(o => o.setName("canal").setDescription("Canal de texto")
      .addChannelTypes(ChannelType.GuildText).setRequired(true)),

  new SlashCommandBuilder().setName("embed")
    .setDescription("Envía un mensaje personalizado").setDefaultMemberPermissions(null)
    .addStringOption(o => o.setName("titulo").setDescription("Título").setRequired(true).setMaxLength(256))
    .addStringOption(o => o.setName("texto").setDescription("Descripción").setRequired(true).setMaxLength(4000))
    .addStringOption(o => o.setName("color").setDescription("Color hexadecimal").setRequired(true).setMaxLength(7))
    .addChannelOption(o => o.setName("canal").setDescription("Canal de texto")
      .addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName("foto").setDescription("Enlace directo a la imagen"))
    .addStringOption(o => o.setName("invitacion").setDescription("Enlace de invitación").setMaxLength(200)),

  new SlashCommandBuilder().setName("configurar-canal-strikes")
    .setDescription("Configura el canal de registros de strikes").setDefaultMemberPermissions(null)
    .addChannelOption(o => o.setName("canal").setDescription("Canal de texto")
      .addChannelTypes(ChannelType.GuildText).setRequired(true)),

  new SlashCommandBuilder().setName("configurar-roles-strikes")
    .setDescription("Configura los tres roles de strike").setDefaultMemberPermissions(null)
    .addRoleOption(o => o.setName("rol_strike_1").setDescription("Rol para el primer strike").setRequired(true))
    .addRoleOption(o => o.setName("rol_strike_2").setDescription("Rol para el segundo strike").setRequired(true))
    .addRoleOption(o => o.setName("rol_strike_3").setDescription("Rol para el tercer strike").setRequired(true)),

  new SlashCommandBuilder().setName("strike")
    .setDescription("Aplica un strike a un miembro del staff").setDefaultMemberPermissions(null)
    .addUserOption(o => o.setName("staff").setDescription("Miembro sancionado").setRequired(true))
    .addStringOption(o => o.setName("razon").setDescription("Motivo de la sanción")
      .setRequired(true).setMinLength(3).setMaxLength(1000)),

  new SlashCommandBuilder().setName("unstrike")
    .setDescription("Retira strikes activos de un miembro del staff").setDefaultMemberPermissions(null)
    .addUserOption(o => o.setName("staff").setDescription("Miembro del staff").setRequired(true))
    .addStringOption(o => o.setName("razon").setDescription("Motivo del retiro")
      .setRequired(true).setMinLength(3).setMaxLength(1000))
    .addIntegerOption(o => o.setName("cuantos_strikes").setDescription("Cantidad de strikes a retirar")
      .setRequired(true).setMinValue(1).setMaxValue(3))
    .addRoleOption(o => o.setName("rol_strike").setDescription("Rol de strike que se quitará").setRequired(true)),

  new SlashCommandBuilder().setName("ping")
    .setDescription("Comprueba si SANTANDER RP responde")
].map(c => c.toJSON());

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  if (!token || !clientId) throw new Error("Falta DISCORD_TOKEN o CLIENT_ID en .env");

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log("Comandos globales registrados correctamente.");
}

main().catch(error => {
  console.error("No se pudieron registrar los comandos:", error.message);
  process.exitCode = 1;
});
