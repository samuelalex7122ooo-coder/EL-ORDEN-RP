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
    title TEXT NOT NULL DEFAULT 'Verificación',
    message TEXT NOT NULL DEFAULT 'Pulsa el botÃ³n para verificarte y obtener acceso al servidor.',
    button_text TEXT NOT NULL DEFAULT 'Verificarme',
    image_url TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#3498DB'
  )
`);

db.exec(`

  CREATE TABLE IF NOT EXISTS service_channel_settings (
    guild_id TEXT PRIMARY KEY,
    entry_channel_id TEXT NOT NULL,
    exit_channel_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS staff_service_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    staff_name TEXT NOT NULL,
    game_id INTEGER NOT NULL,
    staff_rank TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_minutes INTEGER,
    status TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS strike_settings (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staff_strikes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    staff_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    strike_number INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Consultas de servicio preparadas después de crear las tablas
console.log("[DIAGNÓSTICO] Base de datos:", path.join(dataDir, "orden-rp.sqlite"));
console.log("[DIAGNÓSTICO] Tablas:", db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(t => t.name).join(", "));
console.log("[SQLITE] Archivo ejecutado:", __filename);
console.log("[SQLITE] Base de datos:", path.join(dataDir, "orden-rp.sqlite"));

db.exec(`
  CREATE TABLE IF NOT EXISTS service_channel_settings (
    guild_id TEXT PRIMARY KEY,
    entry_channel_id TEXT NOT NULL,
    exit_channel_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS staff_service_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    staff_name TEXT NOT NULL,
    game_id INTEGER NOT NULL,
    staff_rank TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_minutes INTEGER,
    status TEXT NOT NULL DEFAULT 'active'
  );
`);

console.log(
  "[SQLITE] Tabla service_channel_settings:",
  db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='service_channel_settings'").get()
    ? "EXISTE"
    : "NO EXISTE"
);
const getServiceChannels = db.prepare(
  "SELECT entry_channel_id, exit_channel_id FROM service_channel_settings WHERE guild_id = ?"
);
const saveServiceChannels = db.prepare(`
  INSERT INTO service_channel_settings (guild_id, entry_channel_id, exit_channel_id)
  VALUES (?, ?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET
    entry_channel_id = excluded.entry_channel_id,
    exit_channel_id = excluded.exit_channel_id
`);
const getActiveService = db.prepare(
  "SELECT * FROM staff_service_sessions WHERE guild_id = ? AND user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1"
);
const createService = db.prepare(`
  INSERT INTO staff_service_sessions
    (guild_id, user_id, staff_name, game_id, staff_rank, started_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const finishService = db.prepare(`
  UPDATE staff_service_sessions
  SET ended_at = ?, duration_minutes = ?, status = 'finished'
  WHERE id = ? AND status = 'active'
`);

const strikeColumns = db.prepare("PRAGMA table_info(staff_strikes)").all();
if (!strikeColumns.some(c => c.name === "active")) {
  db.exec("ALTER TABLE staff_strikes ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
}

db.exec("CREATE TABLE IF NOT EXISTS strike_role_settings (guild_id TEXT PRIMARY KEY, role_1 TEXT NOT NULL, role_2 TEXT NOT NULL, role_3 TEXT NOT NULL)");

const getStrikeRoles = db.prepare("SELECT role_1, role_2, role_3 FROM strike_role_settings WHERE guild_id = ?");
const setStrikeRoles = db.prepare("INSERT INTO strike_role_settings (guild_id, role_1, role_2, role_3) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET role_1 = excluded.role_1, role_2 = excluded.role_2, role_3 = excluded.role_3");
const getActiveStrikeRows = db.prepare("SELECT id FROM staff_strikes WHERE guild_id = ? AND staff_id = ? AND active = 1 ORDER BY id DESC");
const retireStrikeRow = db.prepare("UPDATE staff_strikes SET active = 0 WHERE id = ? AND guild_id = ? AND staff_id = ? AND active = 1");
const getStrikeChannel = db.prepare(
  "SELECT channel_id FROM strike_settings WHERE guild_id = ?"
);

const setStrikeChannel = db.prepare(`
  INSERT INTO strike_settings (guild_id, channel_id)
  VALUES (?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id
`);

const countStrikes = db.prepare("SELECT COUNT(*) AS total FROM staff_strikes WHERE guild_id = ? AND staff_id = ? AND active = 1");

const saveStrike = db.prepare(`
  INSERT INTO staff_strikes (guild_id, staff_id, moderator_id, reason, strike_number)
  VALUES (?, ?, ?, ?, ?)
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
    .setFooter({ text: "SANTANDER RP 🕷🕸 • Verificación" })
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
  console.log(`SANTANDER RP 🕷🕸 conectado como ${readyClient.user.tag}`);
  console.log("Sistema de verificaciÃ³n multi-servidor activo.");
});

client.on(Events.InteractionCreate, async interaction => {

  // SANTANDER_RP_SERVICE_MODULE
  if (interaction.isChatInputCommand() && interaction.guild) {
    const command = interaction.commandName;

    if (command === "configurar-canales-servicio") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "No tienes permiso para configurar estos canales.", ephemeral: true });
      }
      const entry = interaction.options.getChannel("entrada", true);
      const exit = interaction.options.getChannel("salida", true);
      if (!entry.isTextBased() || !exit.isTextBased()) {
        return interaction.reply({ content: "Selecciona dos canales de texto válidos.", ephemeral: true });
      }
      saveServiceChannels.run(interaction.guildId, entry.id, exit.id);
      return interaction.reply({
        content: "Canales configurados. Entrada: <#" + entry.id + "> · Salida: <#" + exit.id + ">",
        ephemeral: true
      });
    }

    if (command === "entrada") {
      await interaction.deferReply({ ephemeral: true });
      const channels = getServiceChannels.get(interaction.guildId);
      if (!channels) {
        return interaction.editReply("Primero configura los canales con /configurar-canales-servicio.");
      }
      if (getActiveService.get(interaction.guildId, interaction.user.id)) {
        return interaction.editReply("Ya tienes un servicio activo. Usa /salida antes de iniciar otro.");
      }

      const staffName = interaction.options.getString("nombre", true).trim();
      const gameId = interaction.options.getInteger("id", true);
      const staffRank = interaction.options.getString("rango", true).trim();
      if (!staffName || !staffRank || staffName.length > 80 || staffRank.length > 80) {
        return interaction.editReply("El nombre y el rango deben tener entre 1 y 80 caracteres.");
      }

      const started = new Date();
      const channel = await interaction.guild.channels.fetch(channels.entry_channel_id).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return interaction.editReply("El canal de entrada configurado no existe o no es un canal de texto.");
      }

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle("🟢 SERVICIO INICIADO")
        .addFields(
          { name: "♦️ NOMBRE", value: staffName, inline: true },
          { name: "♦️ ID", value: String(gameId), inline: true },
          { name: "♦️ RANGO", value: staffRank, inline: true },
          { name: "🟢 ENTRADA", value: started.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/El_Salvador" }), inline: true },
          { name: "📅 Fecha", value: started.toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long", timeZone: "America/El_Salvador" }), inline: true },
          { name: "🛠️ SALIDA", value: "En servicio...", inline: true }
        )
        .setFooter({ text: "Staff | 𝐒𝐚𝐧𝐭𝐚𝐧𝐝𝐞𝐫 𝐑𝐏 • Nuevo punto registrado" })
        .setTimestamp(started);

      try {
        await channel.send({ embeds: [embed] });
        createService.run(
          interaction.guildId, interaction.user.id, staffName, gameId, staffRank, started.toISOString()
        );
      } catch (error) {
        console.error("Error registrando entrada:", error);
        return interaction.editReply("No se pudo completar el registro. Revisa los permisos del bot y vuelve a intentarlo.");
      }
      return interaction.editReply("Entrada registrada correctamente en " + channel.toString() + ".");
    }

    if (command === "salida") {
      await interaction.deferReply({ ephemeral: true });
      const channels = getServiceChannels.get(interaction.guildId);
      if (!channels) {
        return interaction.editReply("Primero configura los canales con /configurar-canales-servicio.");
      }
      const session = getActiveService.get(interaction.guildId, interaction.user.id);
      if (!session) {
        return interaction.editReply("No tienes una entrada activa. Usa /entrada primero.");
      }

      const ended = new Date();
      const started = new Date(session.started_at);
      const minutes = Math.max(0, Math.floor((ended.getTime() - started.getTime()) / 60000));
      const duration = Math.floor(minutes / 60) + "h " + (minutes % 60) + "min";
      const channel = await interaction.guild.channels.fetch(channels.exit_channel_id).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return interaction.editReply("El canal de salida configurado no existe o no es un canal de texto.");
      }

      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("🔴 SERVICIO FINALIZADO")
        .addFields(
          { name: "♦️ NOMBRE", value: session.staff_name, inline: true },
          { name: "♦️ ID", value: String(session.game_id), inline: true },
          { name: "♦️ RANGO", value: session.staff_rank, inline: true },
          { name: "🟢 ENTRADA", value: started.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/El_Salvador" }), inline: true },
          { name: "📅 Fecha", value: started.toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long", timeZone: "America/El_Salvador" }), inline: true },
          { name: "🛠️ SALIDA", value: ended.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/El_Salvador" }), inline: true },
          { name: "⏱️ Tiempo total", value: duration, inline: false }
        )
        .setFooter({ text: "Staff | 𝐒𝐚𝐧𝐭𝐚𝐧𝐝𝐞𝐫 𝐑𝐏 • Nuevo punto registrado" })
        .setTimestamp(ended);

      try {
        await channel.send({ embeds: [embed] });
        finishService.run(ended.toISOString(), minutes, session.id);
      } catch (error) {
        console.error("Error registrando salida:", error);
        return interaction.editReply("No se pudo completar la salida. Revisa los permisos del bot y vuelve a intentarlo.");
      }
      return interaction.editReply("Servicio finalizado. Tiempo registrado: " + duration + ".");
    }
  }

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

      if (interaction.commandName === "comando") {
        const { EmbedBuilder } = require("discord.js");
        const ayuda = new EmbedBuilder()
          .setColor("#3498DB")
          .setTitle("🕷️ SANTANDER RP | Lista de comandos")
          .setDescription("Estos son los comandos disponibles y su función.")
          .addFields(
            { name: "/comando", value: "Muestra esta lista de comandos.", inline: false },
            { name: "/ping", value: "Comprueba si el bot responde y muestra su latencia.", inline: false },
            { name: "/embed", value: "Crea y publica un embed personalizado.", inline: false },
            { name: "/configurar-canal-strikes", value: "Configura el canal donde se registran los strikes.", inline: false },
            { name: "/configurar-roles-strikes", value: "Configura los roles para el primer, segundo y tercer strike.", inline: false },
            { name: "/strike", value: "Registra un strike para un miembro del staff.", inline: false },
            { name: "/unstrike", value: "Retira strikes según las opciones del comando.", inline: false }
          )
          .setFooter({ text: "SANTANDER RP • Ayuda del bot" });
        return interaction.reply({ embeds: [ayuda], ephemeral: true });
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

      if (interaction.commandName === "configurar-canal-strikes") {
        const canal = interaction.options.getChannel("canal", true);
        const permisos = canal.permissionsFor(await interaction.guild.members.fetchMe());

        if (!permisos?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks
        ])) {
          return interaction.reply({
            content: "Necesito permisos para ver el canal, enviar mensajes y mostrar enlaces.",
            ephemeral: true
          });
        }

        setStrikeChannel.run(interaction.guildId, canal.id);
        return interaction.reply({
          content: "Canal de registros de strikes configurado: " + canal.toString(),
          ephemeral: true
        });
      }

      if (interaction.commandName === "strike") {
        await interaction.deferReply({ ephemeral: true });
        const staff = interaction.options.getUser("staff", true);
        const razon = interaction.options.getString("razon", true).trim();
        if (razon.length < 3) return interaction.editReply("Escribe una razón válida de al menos 3 caracteres.");
        if (staff.bot || staff.id === interaction.user.id) return interaction.editReply("Selecciona a otro miembro del staff, no a un bot ni a ti mismo.");

        const channelCfg = getStrikeChannel.get(interaction.guildId);
        const roleCfg = getStrikeRoles.get(interaction.guildId);
        if (!channelCfg || !roleCfg) return interaction.editReply("Configura primero el canal y los tres roles de strikes.");
        const channel = await interaction.guild.channels.fetch(channelCfg.channel_id).catch(() => null);
        if (!channel || !channel.isTextBased() || !channel.send) return interaction.editReply("El canal de strikes no existe o no es accesible.");

        const total = countStrikes.get(interaction.guildId, staff.id).total + 1;
        if (total > 3) return interaction.editReply("Este miembro ya tiene 3 strikes activos. Usa /unstrike antes de aplicar otro.");
        const roleIds = [roleCfg.role_1, roleCfg.role_2, roleCfg.role_3];
        const role = await interaction.guild.roles.fetch(roleIds[total - 1]).catch(() => null);
        const member = await interaction.guild.members.fetch(staff.id).catch(() => null);
        const botMember = await interaction.guild.members.fetchMe();
        if (!member || !role) return interaction.editReply("No encuentro al miembro o al rol configurado.");
        if (role.managed || role.position >= botMember.roles.highest.position) return interaction.editReply("El rol está por encima del bot o no se puede administrar. Revisa la jerarquía.");
        const hadRole = member.roles.cache.has(role.id);
        let savedId = null;
        try {
          await member.roles.add(role, "Strike #" + total + ": " + razon);
          const result = saveStrike.run(interaction.guildId, staff.id, interaction.user.id, razon, total);
          savedId = Number(result.lastInsertRowid);
          const embed = new EmbedBuilder().setColor("#E74C3C").setTitle("SANTANDER RP | STRIKE AL STAFF").setDescription(
            "**Staff:** " + staff.tag + "\n**Strike activo:** #" + total + "\n**Rol asignado:** " + role.name + "\n**Motivo:** " + razon + "\n**Aplicado por:** " + interaction.user.tag
          ).setTimestamp();
          await channel.send({ embeds: [embed] });
        } catch (error) {
          console.error("Error aplicando strike:", error);
          if (savedId !== null) db.prepare("UPDATE staff_strikes SET active = 0 WHERE id = ?").run(savedId);
          if (!hadRole) await member.roles.remove(role, "Reversión por error al aplicar strike").catch(() => {});
          return interaction.editReply("No se pudo completar el strike. Revisa permisos y registros del bot.");
        }
        try {
          await staff.send({ embeds: [new EmbedBuilder().setColor("#E74C3C").setTitle("SANTANDER RP | STRIKE AL STAFF").setDescription("Strike #" + total + "\nMotivo: " + razon + "\nAplicado por: " + interaction.user.tag).setTimestamp()] });
        } catch {}
        return interaction.editReply("Strike #" + total + " registrado para " + staff.tag + " con el rol " + role.name + ".");
      }
      if (interaction.commandName === "configurar-roles-strikes") {
        const r1 = interaction.options.getRole("rol_strike_1", true);
        const r2 = interaction.options.getRole("rol_strike_2", true);
        const r3 = interaction.options.getRole("rol_strike_3", true);
        if (new Set([r1.id, r2.id, r3.id]).size !== 3) return interaction.reply({ content: "Selecciona tres roles distintos.", ephemeral: true });
        const botMember = await interaction.guild.members.fetchMe();
        for (const role of [r1, r2, r3]) {
          if (role.managed || role.position >= botMember.roles.highest.position) return interaction.reply({ content: "Cada rol debe estar por debajo del rol más alto del bot y ser administrable.", ephemeral: true });
        }
        setStrikeRoles.run(interaction.guildId, r1.id, r2.id, r3.id);
        return interaction.reply({ content: "Roles configurados: strike 1 " + r1 + ", strike 2 " + r2 + ", strike 3 " + r3 + ".", ephemeral: true });
      }

      if (interaction.commandName === "unstrike") {
        await interaction.deferReply({ ephemeral: true });
        const staff = interaction.options.getUser("staff", true);
        const razon = interaction.options.getString("razon", true).trim();
        const cuantos = interaction.options.getInteger("cuantos_strikes", true);
        const selectedRole = interaction.options.getRole("rol_strike", true);
        if (staff.bot || staff.id === interaction.user.id) return interaction.editReply("Selecciona a otro miembro del staff.");
        if (razon.length < 3 || cuantos < 1 || cuantos > 3) return interaction.editReply("La razón debe tener al menos 3 caracteres y la cantidad debe ser de 1 a 3.");
        const channelCfg = getStrikeChannel.get(interaction.guildId);
        const roleCfg = getStrikeRoles.get(interaction.guildId);
        if (!channelCfg || !roleCfg) return interaction.editReply("Configura primero el canal y los roles de strikes.");
        if (![roleCfg.role_1, roleCfg.role_2, roleCfg.role_3].includes(selectedRole.id)) return interaction.editReply("Elige uno de los roles de strike configurados.");
        const rows = getActiveStrikeRows.all(interaction.guildId, staff.id);
        if (rows.length < cuantos) return interaction.editReply("El miembro no tiene suficientes strikes activos para retirar.");
        const member = await interaction.guild.members.fetch(staff.id).catch(() => null);
        if (!member) return interaction.editReply("No encuentro al miembro en este servidor.");
        const botMember = await interaction.guild.members.fetchMe();
        if (selectedRole.position >= botMember.roles.highest.position || selectedRole.managed) return interaction.editReply("El bot no puede administrar ese rol; revisa la jerarquía.");
        const channel = await interaction.guild.channels.fetch(channelCfg.channel_id).catch(() => null);
        if (!channel || !channel.isTextBased() || !channel.send) return interaction.editReply("El canal de registros no está disponible.");
        const wasAssigned = member.roles.cache.has(selectedRole.id);
        try {
          if (wasAssigned) await member.roles.remove(selectedRole, "Retiro administrativo de strikes: " + razon);
          const chosen = rows.slice(0, cuantos);
          const retire = db.transaction(() => { for (const row of chosen) retireStrikeRow.run(row.id, interaction.guildId, staff.id); });
          retire();
          const log = new EmbedBuilder().setColor("#2ECC71").setTitle("SANTANDER RP | STRIKES RETIRADOS").setDescription(
            "**Staff:** " + staff.tag + "\n**Cantidad retirada:** " + cuantos + "\n**Rol seleccionado para quitar:** " + selectedRole.name + "\n**Motivo:** " + razon + "\n**Administrador:** " + interaction.user.tag
          ).setTimestamp();
          await channel.send({ embeds: [log] });
        } catch (error) {
          console.error("Error en /unstrike:", error);
          return interaction.editReply("Ocurrió un error al retirar los strikes. Revisa permisos y registros del bot.");
        }
        return interaction.editReply("Retirados " + cuantos + " strike(s) activo(s) de " + staff.tag + ". Solo se intentó quitar el rol seleccionado: " + selectedRole.name + ".");
      }
      if (interaction.commandName === "embed") {
        await interaction.deferReply({ ephemeral: true });

        try {
          const titulo = interaction.options.getString("titulo", true);
          const texto = interaction.options.getString("texto", true);
          const colorTexto = interaction.options.getString("color", true).trim();
          const foto = interaction.options.getString("foto");
          const invitacion = interaction.options.getString("invitacion");
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
          if (invitacion) {
            const url = invitacion.trim();
            if (!/^https?:\/\/(discord\.gg\/|discord\.com\/invite\/)[A-Za-z0-9-]+\/?$/.test(url)) {
              throw new Error("Usa una invitacion valida de Discord, como https://discord.gg/ejemplo");
            }
            embed.addFields({ name: "🔗 Invitacion al servidor", value: url });
          }

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
          content: `✅ Rol de verificado configurado: ${role}\nEsta opciÃ³n solo afecta a este servidor.`,
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
          content: "✅ Panel actualizado y guardado para este servidor.",
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
          content: `✅ Panel publicado en ${channel}.`,
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
        .setTitle("Verificación | SANTANDER RP 🕷🕸");

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
          content: "La verificaciÃ³n aún no está configurada en este servidor.",
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
          content: "Ya estás verificado. ✅",
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

      await member.roles.add(role, "Verificación mediante SANTANDER RP 🕷🕸");
      let apodoActualizado = true;
      try {
        await member.setNickname(`${nombreRP} | ${idRP}`, "Verificación de SANTANDER RP 🕷🕸");
      } catch (error) {
        apodoActualizado = false;
        console.error("No se pudo cambiar el apodo:", error.message);
      }

      const confirmacion = new EmbedBuilder()
        .setColor("#3498DB")
        .setTitle("✅ Verificación completada")
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
    console.error("Error procesando interacción:", error);

    const reply = {
      content: "Ocurrió un error. Comprueba los permisos del bot y revisa la consola.",
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





