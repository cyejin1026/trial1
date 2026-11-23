const express = require("express");
const { configured, answerNewsQuestion } = require("../services/openai");

const router = express.Router();
const requestsByIp = new Map();
const URL_PATTERN = /^https?:\/\//i;

function clean(value, limit) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function source(value) {
  if (!value || typeof value !== "object") return null;
  const url = clean(value.originalUrl, 2048);
  if (!URL_PATTERN.test(url)) return null;
  return {
    title: clean(value.title, 300), summary: clean(value.summary, 1200),
    publisher: clean(value.publisher, 160), date: clean(value.date, 80),
    category: clean(value.category, 40), originalUrl: url
  };
}

router.post("/", async (request, response) => {
  const ip = request.ip || "unknown";
  const now = Date.now();
  const recent = (requestsByIp.get(ip) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 10) {
    return response.status(429).json({ error: { code: "RATE_LIMITED", message: "질문 요청이 잠시 많습니다. 1분 뒤 다시 시도해 주세요." } });
  }

  const question = clean(request.body?.question, 500);
  if (!question) {
    return response.status(400).json({ error: { code: "EMPTY_QUESTION", message: "질문을 입력해 주세요." } });
  }
  if (String(request.body?.question || "").length > 500) {
    return response.status(400).json({ error: { code: "QUESTION_TOO_LONG", message: "질문은 500자 이내로 입력해 주세요." } });
  }
  const article = source(request.body?.article);
  if (!article || !article.title || !article.summary) {
    return response.status(400).json({ error: { code: "ARTICLE_CONTEXT_REQUIRED", message: "현재 뉴스의 제목과 검색 요약을 확인할 수 없습니다." } });
  }
  if (!configured()) {
    return response.status(503).json({ error: { code: "OPENAI_NOT_CONFIGURED", message: "서버에 OpenAI API 설정이 없어 답변을 만들 수 없습니다. 원문 링크를 확인해 주세요." } });
  }

  const relatedNews = (Array.isArray(request.body?.relatedNews) ? request.body.relatedNews : [])
    .slice(0, 3).map(source).filter(Boolean);
  const history = (Array.isArray(request.body?.history) ? request.body.history : [])
    .slice(-8).filter((entry) => entry && ["user", "assistant"].includes(entry.role))
    .map((entry) => ({ role: entry.role, content: clean(entry.content, 600) }));
  requestsByIp.set(ip, [...recent, now]);
  if (requestsByIp.size > 1000) requestsByIp.delete(requestsByIp.keys().next().value);

  try {
    const result = await answerNewsQuestion({ question, article, relatedNews, history });
    response.json(result);
  } catch (error) {
    console.error("OpenAI 뉴스 챗봇 요청 실패:", error.message);
    response.status(502).json({ error: { code: "OPENAI_REQUEST_FAILED", message: "뉴스 답변을 불러오지 못했습니다. 잠시 후 다시 시도하거나 원문 링크를 확인해 주세요." } });
  }
});

module.exports = router;
