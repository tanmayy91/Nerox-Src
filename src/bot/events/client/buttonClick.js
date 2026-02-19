const event = "buttonClick";
export default class ButtonClick {
  constructor() {
    this.name = event;
    this.execute = async (client, interaction) => {
      if (interaction.customId.includes("playEmbedButton"))
        return void client.emit("playerButtonClick", interaction);
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
