const { normalizeResponse, requestNaver, requireCredentials } = require("./common");

module.exports = async function searchWithDevelopers({ query, limit, category }) {
  const clientId = process.env.NAVER_DEVELOPERS_CLIENT_ID || process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_DEVELOPERS_CLIENT_SECRET || process.env.NAVER_CLIENT_SECRET;
  requireCredentials(clientId, clientSecret);

  const payload = await requestNaver({
    endpoint: "https://openapi.naver.com/v1/search/news.json",
    query,
    limit,
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret
    }
  });
  return normalizeResponse(payload, category);
};
