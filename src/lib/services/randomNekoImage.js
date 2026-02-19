import axios from "axios";
export const randomNekoImage = async (endpoint) => {
  return await axios
    .get(`https://nekos.best/api/v2/${endpoint}`)
    .then((res) => res.data.results[0].url)
    .catch(
      () =>
        `https://media.discordapp.net/attachments/1210593301552697396/1222588572457242654/404.png`,
    );
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
