import { Command } from "../../structures/abstract/command.js";
import Canvas from "canvas";
import { AttachmentBuilder, EmbedBuilder } from "discord.js";

export default class Config extends Command {
  constructor() {
    super(...arguments);
    this.aliases = ["cnf"];
    this.description = "Displays server configuration visually";
  }

  execute = async (client, ctx) => {
    const twoFourSeven = await client.db.twoFourSeven.get(ctx.guild?.id);
    const lodalele = await client.db.serverstaff.get(ctx.guild?.id);

    // Canvas setup
    const width = 720;
    const height = 420;
    const canvas = Canvas.createCanvas(width, height);
    const ctxCanvas = canvas.getContext("2d");

    // Create background gradient
    const gradient = ctxCanvas.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#1e1f22");
    gradient.addColorStop(1, "#2e3136");
    ctxCanvas.fillStyle = gradient;
    ctxCanvas.fillRect(0, 0, width, height);

    // Rounded border
    const drawRoundedRect = (x, y, w, h, r) => {
      ctxCanvas.beginPath();
      ctxCanvas.moveTo(x + r, y);
      ctxCanvas.lineTo(x + w - r, y);
      ctxCanvas.quadraticCurveTo(x + w, y, x + w, y + r);
      ctxCanvas.lineTo(x + w, y + h - r);
      ctxCanvas.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctxCanvas.lineTo(x + r, y + h);
      ctxCanvas.quadraticCurveTo(x, y + h, x, y + h - r);
      ctxCanvas.lineTo(x, y + r);
      ctxCanvas.quadraticCurveTo(x, y, x + r, y);
      ctxCanvas.closePath();
    };

    drawRoundedRect(10, 10, width - 20, height - 20, 20);
    ctxCanvas.lineWidth = 10;
    ctxCanvas.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctxCanvas.shadowColor = "rgba(255, 255, 255, 0.4)";
    ctxCanvas.shadowBlur = 15;
    ctxCanvas.stroke();

    // Reset shadow
    ctxCanvas.shadowBlur = 0;

    // Title
    ctxCanvas.fillStyle = "#ffffff";
    ctxCanvas.font = "bold 36px Arial";
    ctxCanvas.fillText("Server Configuration", 40, 70);

    ctxCanvas.font = "26px Arial";
    ctxCanvas.fillStyle = "#dddddd";

    const textChannel = twoFourSeven?.textId
      ? client.channels.cache.get(twoFourSeven.textId)?.name || "Unknown"
      : "Disabled";

    const voiceChannel = twoFourSeven?.voiceId
      ? client.channels.cache.get(twoFourSeven.voiceId)?.name || "Unknown"
      : "Disabled";

    const dataLines = [
      `• Prefix: ${client.config.prefix}`,
      `• Premium Server: ${lodalele ? "Yes" : "No :("}`,
      `• 24/7 Mode: ${twoFourSeven ? "Enabled" : "Disabled"}`,
      `• Text Channel: ${textChannel}`,
      `• Voice Channel: ${voiceChannel}`,
    ];

    dataLines.forEach((line, i) => {
      ctxCanvas.fillText(line, 50, 130 + i * 40);
    });

    if (!twoFourSeven) {
      ctxCanvas.fillStyle = "#ffcc00";
      ctxCanvas.font = "italic 20px Arial";
      ctxCanvas.fillText("Come on man, enable it, it's free!", 50, 340);
    }

    const attachment = new AttachmentBuilder(canvas.toBuffer(), {
      name: "config.png",
    });

    const embed = new EmbedBuilder()
      .setTitle("Configuration Overview")

      .setImage("attachment://config.png")
      .setFooter({ text: "NeroX | Server Configuration" })
      .setTimestamp();

    await ctx.reply({
      embeds: [embed],
      files: [attachment],
    });
  };
}
