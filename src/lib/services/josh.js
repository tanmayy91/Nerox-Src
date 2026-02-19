import JOSH from "@joshdb/core";
// @ts-expect-error no declaration file for the imported module
import provider from "@joshdb/json";
export const josh = (name) => {
  return new JOSH({
    name,
    provider,
    providerOptions: {
      dataDir: `./database-storage/${name}`,
    },
  });
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
