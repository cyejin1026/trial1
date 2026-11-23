const { createHash } = require("node:crypto");

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
      const normalized = code.toLowerCase();
      if (normalized === "amp") return "&";
      if (normalized === "lt") return "<";
      if (normalized === "gt") return ">";
      if (normalized === "quot") return '"';
      if (normalized === "apos") return "'";
      if (normalized === "nbsp") return " ";
      const number = normalized.startsWith("#x")
        ? Number.parseInt(normalized.slice(2), 16)
        : Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(number) && number > 0 && number <= 0x10ffff
        ? String.fromCodePoint(number)
        : entity;
    })
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeHttpUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function getPublisher(articleUrl) {
  try {
    return new URL(articleUrl).hostname.replace(/^www\./i, "");
  } catch {
    return "언론사 정보 없음";
  }
}

function normalizeResponse(payload, category) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return {
    items: items.map((item) => {
      const originalUrl = safeHttpUrl(item.originallink) || safeHttpUrl(item.link);
      const title = cleanText(item.title);
      const summary = cleanText(item.description);
      const publishedAt = Date.parse(item.pubDate || "");
      const date = Number.isFinite(publishedAt) ? new Date(publishedAt).toISOString() : null;
      return {
        id: createHash("sha1").update(originalUrl || `${title}:${item.pubDate || ""}`).digest("hex").slice(0, 12),
        title,
        summary,
        publisher: getPublisher(originalUrl),
        date,
        originalUrl,
        imageUrl: null,
        category
      };
    }).filter((item) => item.title && item.originalUrl)
  };
}

async function requestNaver({ endpoint, query, limit, headers }) {
  const url = new URL(endpoint);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(limit));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "date");
  if (endpoint.includes("apigw.ntruss.com")) url.searchParams.set("format", "json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`NAVER returned HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    const wrapped = new Error(error.name === "AbortError" ? "NAVER request timed out" : error.message);
    wrapped.code = "NAVER_REQUEST_FAILED";
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}

function requireCredentials(clientId, clientSecret) {
  if (!clientId || !clientSecret) {
    const error = new Error("NAVER credentials are not configured");
    error.code = "NAVER_NOT_CONFIGURED";
    throw error;
  }
}

module.exports = { normalizeResponse, requestNaver, requireCredentials };
