require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const {
  Client,
  GatewayIntentBits,
  Events,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  throw new Error("Configura DISCORD_TOKEN y CLIENT_ID en .env");
}

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "orden-rp.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS verification_settings (
    guild_id TEXT PRIMARY KEY,
    role_id TEXT,
    channel_id TEXT,
    title TEXT NOT NULL DEFAULT 'VerificaciÃ³n',
    message TEXT NOT NULL DEFAULT 'Pulsa el botÃ³n para verificarte y obtener acceso al servidor.',
    button_text TEXT NOT NULL DEFAULT 'Verificarme',
    image_url TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#3498DB'
  )
`);

const getSettings = db.prepare(
  "SELECT * FROM verification_settings WHERE guild_id = ?"
);

const insertSettings = db.prepare(`
  INSERT OR IGNORE INTO verification_settings (guild_id)
  VALUES (?)
`);

const updateRole = db.prepare(`
  UPDATE verification_settings SET role_id = ? WHERE guild_id = ?
`);

const updateField = db.prepare(`
  UPDATE verification_settings SET
    title = ?, message = ?, button_text = ?, image_url = ?, color = ?
  WHERE guild_id = ?
`);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

function settingsFor(guildId) {
  insertSettings.run(guildId);
  return getSettings.get(guildId);
}

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

function makePanel(settings) {
  const embed = new EmbedBuilder()
    .setColor(settings.color)
    .setTitle(settings.title)
    .setDescription(settings.message)
    .setFooter({ text: "EL ORDEN RP â€¢ VerificaciÃ³n" })
    .setTimestamp();

  if (settings.image_url) embed.setImage(settings.image_url);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("orden_rp_verificar")
      .setLabel(settings.button_text)
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

client.once(Events.ClientReady, readyClient => {
  console.log(`EL ORDEN RP conectado como ${readyClient.user.tag}`);
  console.log("Sistema de verificaciÃ³n multi-servidor activo.");
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isRepliable() && !interaction.isAutocomplete()) {
    const tiempoInicio = Date.now();
    interaction.__ordenInicio = tiempoInicio;
  }
  try {
    if (interaction.isChatInputCommand()) {
      if (!interaction.inGuild()) {
        return interaction.reply({
          content: "Este comando solo funciona dentro de un servidor.",
          ephemeral: true
        });
      }

      if (interaction.commandName === "ping") {
        return interaction.reply({
          content: `ðŸ“ Pong: ${client.ws.ping} ms`,
          ephemeral: true
        });
      }

      if (!isAdmin(interaction)) {
        return interaction.reply({
          content: "No tienes permiso. Necesitas administrar el servidor.",
          ephemeral: true
        });
      }

      if (interaction.commandName === "embed") {
        await interaction.deferReply({ ephemeral: true });

        try {
          const titulo = interaction.options.getString("titulo", true);
          const texto = interaction.options.getString("texto", true);
          const colorTexto = interaction.options.getString("color", true).trim();
          const foto = interaction.options.getString("foto");
          const canal = interaction.options.getChannel("canal", true);

          if (!/^#?[0-9a-fA-F]{6}$/.test(colorTexto)) {
            return interaction.editReply("Color inválido. Usa un hexadecimal como #3498DB.");
          }

          if (!canal.isTextBased() || !canal.send) {
            return interaction.editReply("Selecciona un canal de texto válido.");
          }

          if (foto && !/^https?:\/\/\S+$/i.test(foto)) {
            return interaction.editReply("El enlace de la foto debe comenzar con http:// o https://.");
          }

          const color = parseInt(colorTexto.replace("#", ""), 16);
          const embed = new EmbedBuilder()
            .setTitle(titulo)
            .setDescription(texto)
            .setColor(color)
            .setTimestamp();

          if (foto) embed.setImage(foto);

          await canal.send({ embeds: [embed] });
          return interaction.editReply("Mensaje publicado correctamente en " + canal.toString() + ".");
        } catch (error) {
          console.error("Error en /embed:", error);
          return interaction.editReply("No pude publicar el mensaje. Revisa los permisos del bot en ese canal.");
        }
      }
      const settings = settingsFor(interaction.guildId);

      if (interaction.commandName === "configurar-verificacion") {
        const role = interaction.options.getRole("rol", true);
        if (!interaction.guild || !interaction.guildId) { return interaction.reply({ content: "Este comando solo funciona dentro de un servidor.", flags: 64 }); }
        const botMember = await interaction.guild.members.fetchMe();

        if (role.id === interaction.guild.id || role.managed ||
            role.position >= botMember.roles.highest.position) {
          return interaction.reply({
            content: "Ese rol no se puede asignar. Elige un rol normal situado debajo del rol mÃ¡s alto del bot.",
            ephemeral: true
          });
        }

        updateRole.run(role.id, interaction.guildId);

        return interaction.reply({
          content: `âœ… Rol de verificado configurado: ${role}\nEsta opciÃ³n solo afecta a este servidor.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "editar-panel") {
        const title = interaction.options.getString("titulo") ?? settings.title;
        const message = interaction.options.getString("mensaje") ?? settings.message;
        const button = interaction.options.getString("boton") ?? settings.button_text;
        let imageUrl = settings.image_url;
        const imageInput = interaction.options.getString("imagen");
        const colorInput = interaction.options.getString("color");
        let color = settings.color;

        if (imageInput !== null) {
          if (imageInput.toLowerCase() === "ninguna") {
            imageUrl = "";
          } else {
            try {
              const url = new URL(imageInput);
              if (url.protocol !== "https:") throw new Error("URL no HTTPS");
              imageUrl = url.toString();
            } catch {
              return interaction.reply({
                content: "La imagen debe ser una URL vÃ¡lida que comience con https://. Para quitarla, escribe ninguna.",
                ephemeral: true
              });
            }
          }
        }

        if (colorInput !== null) {
          if (!/^#[0-9a-fA-F]{6}$/.test(colorInput)) {
            return interaction.reply({
              content: "El color debe tener formato hexadecimal, por ejemplo #3498DB.",
              ephemeral: true
            });
          }
          color = colorInput.toUpperCase();
        }

        const options = interaction.options;
        if (options.data.length === 0) {
          return interaction.reply({
            content: "Indica al menos una opciÃ³n para editar.",
            ephemeral: true
          });
        }

        updateField.run(title, message, button, imageUrl, color, interaction.guildId);

        return interaction.reply({
          content: "âœ… Panel actualizado y guardado para este servidor.",
          embeds: [makePanel(settingsFor(interaction.guildId)).embeds[0]],
          ephemeral: true
        });
      }

      if (interaction.commandName === "publicar-verificacion") {
        const current = settingsFor(interaction.guildId);
        if (!current.role_id) {
          return interaction.reply({
            content: "Primero usa /configurar-verificacion para elegir el rol.",
            ephemeral: true
          });
        }

        const channel = interaction.options.getChannel("canal", true);
        if (!channel.isTextBased() || !channel.send) {
          return interaction.reply({
            content: "Selecciona un canal de texto vÃ¡lido.",
            ephemeral: true
          });
        }

        if (!interaction.guild || !interaction.guildId) { return interaction.reply({ content: "Este comando solo funciona dentro de un servidor.", flags: 64 }); }
        const botMember = await interaction.guild.members.fetchMe();
        const permissions = channel.permissionsFor(botMember);

        if (!permissions?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks
        ])) {
          return interaction.reply({
            content: "Necesito permisos para ver el canal, enviar mensajes y mostrar enlaces.",
            ephemeral: true
          });
        }

        const sent = await channel.send(makePanel(current));
        return interaction.reply({
          content: `âœ… Panel publicado en ${channel}.`,
          ephemeral: true
        });
      }
    }

    if (interaction.isButton() &&
        interaction.customId === "orden_rp_verificar") {
      if (!interaction.inGuild()) {
        return interaction.reply({
          content: "Este botÃ³n solo funciona dentro de un servidor.",
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId("orden_rp_verificar_modal")
        .setTitle("VerificaciÃ³n | EL ORDEN RP");

      const nombreInput = new TextInputBuilder()
        .setCustomId("nombre_rp")
        .setLabel("Nombre dentro del RP")
        .setPlaceholder("Escribe tu nombre de personaje")
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(50)
        .setRequired(true);

      const idInput = new TextInputBuilder()
        .setCustomId("id_rp")
        .setLabel("ID del usuario")
        .setPlaceholder("Escribe tu ID dentro del servidor RP")
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(30)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nombreInput),
        new ActionRowBuilder().addComponents(idInput)
      );

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() &&
        interaction.customId === "orden_rp_verificar_modal") {
      if (!interaction.inGuild()) {
        return interaction.reply({
          content: "Este formulario solo funciona dentro de un servidor.",
          ephemeral: true
        });
      }

      const nombreRP = interaction.fields.getTextInputValue("nombre_rp").trim();
      const idRP = interaction.fields.getTextInputValue("id_rp").trim();

      if (!nombreRP || !idRP) {
        return interaction.reply({
          content: "Debes completar ambos campos.",
          ephemeral: true
        });
      }

      const settings = getSettings.get(interaction.guildId);
      if (!settings?.role_id) {
        return interaction.reply({
          content: "La verificaciÃ³n aÃºn no estÃ¡ configurada en este servidor.",
          ephemeral: true
        });
      }

      const role = await interaction.guild.roles.fetch(settings.role_id);
      if (!role || role.managed || role.id === interaction.guildId) {
        return interaction.reply({
          content: "El rol configurado no existe o no se puede asignar. Contacta a un administrador.",
          ephemeral: true
        });
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (member.roles.cache.has(role.id)) {
        return interaction.reply({
          content: "Ya estÃ¡s verificado. âœ…",
          ephemeral: true
        });
      }

      const botMember = await interaction.guild.members.fetchMe();
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) ||
          role.position >= botMember.roles.highest.position) {
        return interaction.reply({
          content: "El bot necesita permiso Administrar roles y su rol debe estar por encima del rol de verificado.",
          ephemeral: true
        });
      }

      await member.roles.add(role, "VerificaciÃ³n mediante EL ORDEN RP");
      let apodoActualizado = true;
      try {
        await member.setNickname(`${nombreRP} | ${idRP}`, "Verificación de EL ORDEN RP");
      } catch (error) {
        apodoActualizado = false;
        console.error("No se pudo cambiar el apodo:", error.message);
      }

      const confirmacion = new EmbedBuilder()
        .setColor("#3498DB")
        .setTitle("âœ… VerificaciÃ³n completada")
        .setDescription(apodoActualizado ? "Verificación completada. Tu apodo se actualizó al nombre de personaje." : "Verificación completada, pero no se pudo cambiar tu apodo. Revisa los permisos del bot.")
        .addFields(
          { name: "Nombre dentro del RP", value: nombreRP },
          { name: "ID del usuario", value: idRP },
          { name: "Usuario de Discord", value: interaction.user.tag }
        )
        .setTimestamp();

      return interaction.reply({
        embeds: [confirmacion],
        ephemeral: true
      });
    }

  } catch (error) {
    console.error("Error procesando interacciÃ³n:", error);

    const reply = {
      content: "OcurriÃ³ un error. Comprueba los permisos del bot y revisa la consola.",
      ephemeral: true
    };

    if (interaction.deferred) {
      await interaction.editReply(reply).catch(() => {});
    } else if (!interaction.replied) {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

client.on("error", error => console.error("Error del cliente Discord:", error));
process.on("unhandledRejection", error => console.error("Error asíncrono:", error));
client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error("No se pudo iniciar sesiÃ³n en Discord:", error.message);
  process.exitCode = 1;
});





