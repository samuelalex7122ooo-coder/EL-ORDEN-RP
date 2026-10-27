require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("configurar-verificacion")
    .setDescription("Selecciona el rol que se asignarÃ¡ al verificar")
    .setDefaultMemberPermissions(null)
    .addRoleOption(o =>
      o.setName("rol")
        .setDescription("Rol que recibirÃ¡n los miembros verificados")
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName("editar-panel")
    .setDescription("Personaliza el panel de verificaciÃ³n de este servidor")
    .setDefaultMemberPermissions(null)
    .addStringOption(o =>
      o.setName("titulo")
        .setDescription("TÃ­tulo del panel")
        .setMaxLength(256))
    .addStringOption(o =>
      o.setName("mensaje")
        .setDescription("DescripciÃ³n del panel")
        .setMaxLength(4000))
    .addStringOption(o =>
      o.setName("boton")
        .setDescription("Texto del botÃ³n")
        .setMaxLength(80))
    .addStringOption(o =>
      o.setName("imagen")
        .setDescription("URL HTTPS de imagen, o escribe ninguna para quitarla")
        .setMaxLength(500))
    .addStringOption(o =>
      o.setName("color")
        .setDescription("Color hexadecimal, por ejemplo #3498DB")
        .setMaxLength(7)),

  new SlashCommandBuilder()
    .setName("publicar-verificacion")
    .setDescription("Publica el panel en un canal de este servidor")
    .setDefaultMemberPermissions(null)
    .addChannelOption(o =>
      o.setName("canal")
        .setDescription("Canal de texto donde publicar")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("EnvÃ­a un mensaje personalizado con imagen y color")
    .setDefaultMemberPermissions(null)
    .addStringOption(o =>
      o.setName("titulo").setDescription("TÃ­tulo del mensaje").setRequired(true).setMaxLength(256))
    .addStringOption(o =>
      o.setName("texto").setDescription("DescripciÃ³n del mensaje").setRequired(true).setMaxLength(4000))
    .addStringOption(o =>
      o.setName("color").setDescription("Color hexadecimal, ejemplo #3498DB").setRequired(true).setMaxLength(7))
    .addChannelOption(o =>
      o.setName("canal").setDescription("Canal donde enviar el mensaje").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o =>
      o.setName("foto").setDescription("Enlace directo a la imagen").setRequired(false))
    .addStringOption(o => o.setName("invitacion").setDescription("Enlace de invitacion de Discord").setRequired(false).setMaxLength(200))
,
  new SlashCommandBuilder()
    .setName("configurar-canal-strikes")
    .setDescription("Configura el canal donde se registran los strikes")
    .setDefaultMemberPermissions(null)
    .addChannelOption(o =>
      o.setName("canal")
        .setDescription("Canal de texto para los registros")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName("strike")
    .setDescription("Aplica un strike a un miembro del staff")
    .setDefaultMemberPermissions(null)
    .addUserOption(o =>
      o.setName("staff")
        .setDescription("Miembro del staff sancionado")
        .setRequired(true))
    .addStringOption(o =>
      o.setName("razon")
        .setDescription("RazÃ³n obligatoria de la sanciÃ³n")
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(1000)),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Comprueba si SANTANDER RP ðŸ•·ðŸ•¸ responde")
].map(c => c.toJSON());

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;

  if (!token || !clientId) {
    throw new Error("Falta DISCORD_TOKEN o CLIENT_ID en el archivo .env");
  }

  const rest = new REST({ version: "10" }).setToken(token);

  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );

  console.log("Comandos globales registrados correctamente.");
  console.log("Pueden tardar un tiempo en aparecer en Discord.");
}

main().catch(error => {
  console.error("No se pudieron registrar los comandos:", error.message);
  process.exitCode = 1;
});

