const developersSearch = require("./developers");
const hubSearch = require("./api-hub");

const providers = {
  developers: developersSearch,
  hub: hubSearch
};

async function searchNews(options) {
  const name = (process.env.NAVER_PROVIDER || "hub").trim().toLowerCase();
  const provider = providers[name];
  if (!provider) {
    const error = new Error("NAVER_PROVIDER must be developers or hub");
    error.code = "NAVER_NOT_CONFIGURED";
    throw error;
  }
  return provider(options);
}

module.exports = { searchNews };
