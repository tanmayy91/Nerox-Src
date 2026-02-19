import { createCanvas, loadImage, registerFont } from "canvas";
import { AttachmentBuilder } from "discord.js";

/**
 * Polyfill for roundRect if not available
 */
function addRoundRectSupport(ctx) {
  if (!ctx.roundRect) {
    ctx.roundRect = function (x, y, width, height, radius) {
      if (width < 2 * radius) radius = width / 2;
      if (height < 2 * radius) radius = height / 2;
      this.beginPath();
      this.moveTo(x + radius, y);
      this.arcTo(x + width, y, x + width, y + height, radius);
      this.arcTo(x + width, y + height, x, y + height, radius);
      this.arcTo(x, y + height, x, y, radius);
      this.arcTo(x, y, x + width, y, radius);
      this.closePath();
      return this;
    };
  }
}

// --- Configuration for Elegant Dark Design ---
const CARD_WIDTH = 800;
const CARD_HEIGHT = 280;
const PADDING = 35;
const THUMB_SIZE = 210;
const ACCENT_COLOR = "#8A2BE2"; // Muted Violet/BlueViolet
const BG_PRIMARY = "#121212"; // Ultra dark
const BG_SECONDARY = "#282828"; // Card middle tone
const TEXT_LIGHT = "#F0F0F0";
const TEXT_MEDIUM = "#A0A0A0";
// ----------------------------------------

/**
 * Generates an elegant and minimal music card
 * @param {Object} track - The track object from the player
 * @param {Object} requester - The user who requested the track
 * @returns {Promise<AttachmentBuilder>} - Discord attachment with the card image
 */
export async function generateSpotifyCard(track, requester) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  addRoundRectSupport(ctx);

  // 1. Full Background (A subtle dark gradient for depth)
  const bgGradient = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  bgGradient.addColorStop(0, BG_PRIMARY);
  bgGradient.addColorStop(1, "#1A1A1A");
  ctx.fillStyle = bgGradient;
  ctx.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 15);
  ctx.fill();

  // 2. Load and Draw Thumbnail
  const thumbX = PADDING;
  const thumbY = (CARD_HEIGHT - THUMB_SIZE) / 2;

  try {
    const thumbnailUrl =
      track.thumbnail || track.artworkUrl || "https://via.placeholder.com/250";
    const thumbnail = await loadImage(thumbnailUrl);

    // Apply soft shadow for depth (subtle, not glowing)
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;

    // Draw slightly rounded thumbnail
    ctx.beginPath();
    ctx.roundRect(thumbX, thumbY, THUMB_SIZE, THUMB_SIZE, 8);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(thumbnail, thumbX, thumbY, THUMB_SIZE, THUMB_SIZE);
    ctx.restore();
  } catch (error) {
    console.error("Error loading thumbnail:", error);
    // Placeholder
    ctx.shadowColor = "transparent";
    ctx.fillStyle = BG_SECONDARY;
    ctx.roundRect(thumbX, thumbY, THUMB_SIZE, THUMB_SIZE, 8);
    ctx.fill();

    ctx.fillStyle = TEXT_MEDIUM;
    ctx.font = "bold 36px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🎧", thumbX + THUMB_SIZE / 2, thumbY + THUMB_SIZE / 2 + 10);
  }

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";

  // 3. Text Content (Right side)
  const textStartX = thumbX + THUMB_SIZE + PADDING;

  // A. Now Playing tag (Muted accent)
  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = "bold 18px Arial";
  ctx.fillText("NOW PLAYING", textStartX, 50);

  // B. Track Title (Largest, Bold)
  ctx.fillStyle = TEXT_LIGHT;
  ctx.font = "bold 38px Arial";
  const titleText =
    track.title?.length > 25
      ? track.title.substring(0, 25) + "..."
      : track.title || "Unknown Track Name";
  ctx.fillText(titleText, textStartX, 98);

  // C. Author/Artist (Subtitle)
  ctx.fillStyle = TEXT_MEDIUM;
  ctx.font = "22px Arial";
  const authorText =
    track.author?.length > 30
      ? track.author.substring(0, 30) + "..."
      : track.author || "Unknown Artist";
  ctx.fillText(authorText, textStartX, 135);

  // 4. Progress Bar (Clean and Simple)
  const barX = textStartX;
  const barY = 180;
  const barWidth = CARD_WIDTH - barX - PADDING - 40;
  const barHeight = 4;

  // Bar background
  ctx.fillStyle = BG_SECONDARY;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barWidth, barHeight, 2);
  ctx.fill();

  // Bar foreground (Static 10% progress)
  const progressWidth = Math.min(barWidth, barWidth * 0.1);
  ctx.fillStyle = ACCENT_COLOR;
  ctx.beginPath();
  ctx.roundRect(barX, barY, progressWidth, barHeight, 2);
  ctx.fill();

  // Current time indicator circle
  ctx.fillStyle = TEXT_LIGHT; // Use white for high contrast
  ctx.beginPath();
  ctx.arc(barX + progressWidth, barY + barHeight / 2, 6, 0, Math.PI * 2);
  ctx.fill();

  // Duration text
  ctx.fillStyle = TEXT_MEDIUM;
  ctx.font = "16px Arial";
  const duration = track.isStream
    ? "LIVE STREAM"
    : formatDuration(track.length || 0);

  ctx.fillText("0:00", barX, barY + 25);
  ctx.textAlign = "right";
  ctx.fillText(duration, barX + barWidth, barY + 25);
  ctx.textAlign = "left";

  // 5. Requested by section (Minimalist Footer)
  ctx.fillStyle = TEXT_MEDIUM;
  ctx.font = "16px Arial";
  ctx.fillText("Requested by:", textStartX, 240);

  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = "bold 18px Arial";
  const requesterName =
    requester?.displayName?.length > 20
      ? requester.displayName.substring(0, 20) + "..."
      : requester?.displayName || "Unknown User";
  ctx.fillText(requesterName, textStartX + 105, 240);

  // Create attachment
  const attachment = new AttachmentBuilder(canvas.toBuffer("image/png"), {
    name: "now-playing-minimal.png",
  });

  return attachment;
}

/**
 * Format duration helper function
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
