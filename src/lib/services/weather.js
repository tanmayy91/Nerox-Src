import axios from "axios";
import xml2JS from "xml2js";
import qs from "querystring";
const xmlParser = new xml2JS.Parser({
  charkey: "C$",
  attrkey: "A$",
  explicitArray: true,
});
export const getWeather = async (location) => {
  if (!location.length) return;
  const res = await axios
    .get(
      `http://weather.service.msn.com/find.aspx?src=outlook&weadegreetype=C&culture=en-us&weasearchstr=${qs.escape(location)}`,
    )
    .catch(() => undefined);
  if (!res) return;
  if (res.data.includes("Weather-location lat/lon not found")) return;
  const data = await new Promise((resolve) =>
    xmlParser.parseString(res.data, (error, result) => resolve(result)),
  );
  return {
    weather: data.weatherdata.weather[0].current[0].A$.skytext,
    wind: data.weatherdata.weather[0].current[0].A$.winddisplay,
    humidity: data.weatherdata.weather[0].current[0].A$.humidity,
    location: data.weatherdata.weather[0].A$.weatherlocationname,
    feelslike: data.weatherdata.weather[0].current[0].A$.feelslike,
    temperature: data.weatherdata.weather[0].current[0].A$.temperature,
    img: `http://blob.weather.microsoft.com/static/weather4/en-us/law/${data.weatherdata.weather[0].current[0].A$.skycode}.gif`,
  };
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
