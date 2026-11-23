const { normalizeResponse, requestNaver, requireCredentials } = require("./common");

module.exports = async function searchWithApiHub({ query, limit, category }) {
  const clientId = process.env.NAVER_API_HUB_CLIENT_ID;
  const clientSecret = process.env.NAVER_API_HUB_CLIENT_SECRET;
  requireCredentials(clientId, clientSecret);

  const payload = await requestNaver({
    endpoint: "https://naverapihub.apigw.ntruss.com/search/v1/news",
    query,
    limit,
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret
    }
  });
  return normalizeResponse(payload, category);
};
