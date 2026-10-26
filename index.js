require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once(Events.ClientReady, c => {
  console.log(`EL ORDEN RP conectado como ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    // COMANDO /PING
    if (interaction.isChatInputCommand() &&
        interaction.commandName === "ping") {
      return await interaction.reply({
        content: "Pong 🏓",
        ephemeral: true
      });
    }

    // COMANDO /VERIFICACION
    if (interaction.isChatInputCommand() &&
        interaction.commandName === "verificacion") {

      // Reconocer la interacción antes de preparar el panel.
      await interaction.deferReply();

      const embed = new EmbedBuilder()
        .setColor(0xE53935)
        .setTitle("El Orden RP")
        .setDescription(
          "**Identificación El Orden RP**\n\n" +
          "1. Presiona **Verificar**.\n" +
          "2. Ingresa tu **Nombre y Apellido**.\n" +
          "3. Ingresa tu **ID del juego**.\n\n" +
          "✅ El sistema te registrará automáticamente."
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("orden_verificar")
          .setLabel("Verificar")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Danger)
      );

      return await interaction.editReply({
        embeds: [embed],
        components: [row]
      });
    }

    // BOTÓN VERIFICAR: mostrar el formulario directamente.
    if (interaction.isButton() &&
        interaction.customId === "orden_verificar") {

      const modal = new ModalBuilder()
        .setCustomId("orden_formulario")
        .setTitle("Identificación El Orden RP");

      const nombre = new TextInputBuilder()
        .setCustomId("nombre")
        .setLabel("Nombre y Apellido")
        .setPlaceholder("Escribe tu nombre del juego")
        .setStyle(TextInputStyle.Short)
        .setMinLength(3)
        .setMaxLength(50)
        .setRequired(true);

      const id = new TextInputBuilder()
        .setCustomId("id_juego")
        .setLabel("ID del juego")
        .setPlaceholder("Escribe tu ID")
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(20)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nombre),
        new ActionRowBuilder().addComponents(id)
      );

      return await interaction.showModal(modal);
    }

    // ENVÍO DEL FORMULARIO
    if (interaction.isModalSubmit() &&
        interaction.customId === "orden_formulario") {

      // Responder a Discord inmediatamente para evitar el error 10062.
      await interaction.deferReply({ ephemeral: true });

      const nombre = interaction.fields
        .getTextInputValue("nombre").trim();

      const id = interaction.fields
        .getTextInputValue("id_juego").trim();

      if (!nombre || !id) {
        return await interaction.editReply(
          "❌ Debes completar tu nombre y tu ID."
        );
      }

      let apodoActualizado = false;
      let rolesActualizados = false;
      const errores = [];

      // Buscar al miembro y actualizar el apodo.
      if (interaction.guild) {
        let miembro;

        try {
          miembro = await interaction.guild.members.fetch(
            interaction.user.id
          );
        } catch (error) {
          console.error("Error buscando al miembro:", error);
          errores.push("No pude encontrar tu miembro en el servidor.");
        }

        if (miembro) {
          const idTexto = String(id).slice(0, 20);
          const sufijo = ` | ${idTexto}`;
          const apodo =
            String(nombre).slice(0, 32 - sufijo.length) + sufijo;

          try {
            await miembro.setNickname(
              apodo.slice(0, 32),
              "Verificación de EL ORDEN RP"
            );
            apodoActualizado = true;
            console.log("Apodo actualizado:", apodo);
          } catch (error) {
            console.error(
              "No se pudo cambiar el apodo:",
              error.code,
              error.message
            );
            errores.push(
              "No pude cambiar tu apodo; un administrador debe revisar los permisos."
            );
          }

          // Asignar el rol verificado y quitar el anterior.
          const verifiedRoleId = process.env.VERIFIED_ROLE_ID;
          const unverifiedRoleId = process.env.UNVERIFIED_ROLE_ID;

          try {
            if (verifiedRoleId) {
              await miembro.roles.add(
                verifiedRoleId,
                "Formulario de verificación enviado"
              );
            }

            if (unverifiedRoleId &&
                miembro.roles.cache.has(unverifiedRoleId)) {
              await miembro.roles.remove(
                unverifiedRoleId,
                "Verificación completada"
              );
            }

            rolesActualizados = Boolean(verifiedRoleId);
          } catch (error) {
            console.error(
              "Error actualizando roles:",
              error.code,
              error.message
            );
            errores.push(
              "No pude actualizar tus roles; revisa la jerarquía y los permisos del bot."
            );
          }
        }
      }

      // Enviar registro al canal configurado, sin bloquear la verificación.
      const logId = process.env.GENERAL_LOG_CHANNEL_ID;

      if (logId) {
        try {
          const canal = await client.channels.fetch(logId);

          if (canal && canal.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor(0xE53935)
              .setTitle("Nueva identificación | El Orden RP")
              .addFields(
                {
                  name: "Usuario de Discord",
                  value: `${interaction.user.tag} (${interaction.user.id})`
                },
                { name: "Nombre y Apellido", value: nombre },
                { name: "ID del juego", value: id }
              )
              .setTimestamp();

            await canal.send({ embeds: [embed] });
          }
        } catch (error) {
          console.error("No se pudo enviar el registro:", error);
        }
      }

      let mensaje =
        "✅ Tu identificación fue recibida.\n" +
        `**Nombre:** ${nombre}\n` +
        `**ID del juego:** ${id}\n`;

      mensaje += apodoActualizado
        ? "✅ Apodo actualizado.\n"
        : "⚠️ El apodo no se pudo actualizar.\n";

      mensaje += rolesActualizados
        ? "✅ Roles procesados.\n"
        : "⚠️ No se confirmó la asignación del rol verificado.\n";

      if (errores.length) {
        mensaje += "\n" + errores.join("\n");
      }

      return await interaction.editReply(mensaje);
    }
  } catch (error) {
    console.error("Error procesando interacción:", error);

    try {
      if (interaction.deferred) {
        await interaction.editReply(
          "❌ Ocurrió un error al procesar la interacción. Revisa la terminal."
        );
      } else if (interaction.replied) {
        await interaction.followUp({
          content: "❌ Ocurrió un error al procesar la interacción.",
          ephemeral: true
        });
      } else if (interaction.isRepliable()) {
        await interaction.reply({
          content: "❌ Ocurrió un error al procesar la interacción.",
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error("No se pudo responder a Discord:", replyError);
    }
  }
});

client.on(Events.Error, error => {
  console.error("Error del cliente Discord:", error);
});

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error("No se pudo conectar el bot:", error);
});
