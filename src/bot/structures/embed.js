import { EmbedBuilder } from "discord.js";
export class ExtendedEmbedBuilder extends EmbedBuilder {
  constructor(color) {
    super();
    this.title = (title) => this.setTitle(title);
    this.thumb = (uri) => this.setThumbnail(uri);
    this.desc = (text) => this.setDescription(text);
    this.footer = (op) => this.setFooter(op);
    this.img = (uri) => (uri ? this.setImage(uri) : this);
    this.setColor(color);
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
