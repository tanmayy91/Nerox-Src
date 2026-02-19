import { ButtonStyle, ButtonBuilder } from "discord.js";
export class ExtendedButtonBuilder extends ButtonBuilder {
  constructor() {
    super(...arguments);
    this.link = (label, uri) =>
      this.setStyle(ButtonStyle.Link).setURL(uri).setLabel(label);
    this.danger = (...args) => this.makeButton(ButtonStyle.Danger, ...args);
    this.primary = (...args) => this.makeButton(ButtonStyle.Primary, ...args);
    this.success = (...args) => this.makeButton(ButtonStyle.Success, ...args);
    this.secondary = (...args) =>
      this.makeButton(ButtonStyle.Secondary, ...args);
  }
  makeButton(style, ...args) {
    const [customId, label, emoji, disabled] = args;
    if (label) this.setLabel(label);
    if (emoji) this.setEmoji(emoji);
    if (disabled) this.setDisabled(disabled);
    return this.setCustomId(customId).setStyle(style);
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
