const express = require("express");
const { searchNews } = require("../providers/naver");
const newsRepository = require("../db/news-repository");
const openai = require("../services/openai");

const router = express.Router();
const timelineRequestsByIp = new Map();
const categoryQueries = {
  "전체": "오늘 주요 뉴스",
  "정치": "정치 뉴스",
  "경제": "경제 뉴스",
  "사회": "사회 뉴스",
  "문화": "문화 뉴스",
  "IT": "IT 기술 뉴스"
};

async function withCardSummaries(items) {
  const summaries = await openai.summarizeNews(items);
  return items.map((item) => ({
    ...item,
    ...(summaries.get(item.id) || {
      cardSummary: item.summary || "제공된 정보만으로는 충분한 내용을 확인하기 어렵습니다.",
      summaryInsufficient: !item.summary,
      summaryMode: item.summary ? "provider_excerpt" : "insufficient"
    })
  }));
}

router.get("/:id/timeline", async (request, response) => {
  const title = String(request.query.title || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const summary = String(request.query.summary || "").replace(/\s+/g, " ").trim().slice(0, 400);
  const category = String(request.query.category || "전체");
  const currentUrl = String(request.query.originalUrl || "").slice(0, 2048);
  if (!title || !Object.hasOwn(categoryQueries, category)) {
    return response.status(400).json({ error: { code: "INVALID_TIMELINE_QUERY", message: "관련 뉴스를 검색할 기사 정보가 부족합니다." } });
  }

  const ip = request.ip || "unknown";
  const now = Date.now();
  const recent = (timelineRequestsByIp.get(ip) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 20) {
    return response.status(429).json({ error: { code: "TIMELINE_RATE_LIMITED", message: "관련 뉴스 요청이 잠시 많습니다. 잠시 후 다시 시도해 주세요." } });
  }
  timelineRequestsByIp.set(ip, [...recent, now]);
  if (timelineRequestsByIp.size > 1000) timelineRequestsByIp.delete(timelineRequestsByIp.keys().next().value);

  const query = `${title}${summary ? ` ${summary.slice(0, 100)}` : ""}`.slice(0, 280);
  try {
    const result = await searchNews({ query, limit: 10, category });
    const seen = new Set();
    const dated = [];
    let missingDateCount = 0;
    for (const item of result.items) {
      if (!item.originalUrl || item.originalUrl === currentUrl || !item.title || seen.has(item.originalUrl)) continue;
      seen.add(item.originalUrl);
      if (!item.date || Number.isNaN(Date.parse(item.date))) {
        missingDateCount += 1;
        continue;
      }
      dated.push({
        id: item.id,
        title: item.title,
        description: item.summary || "검색 결과에 사건 설명이 제공되지 않았습니다.",
        publisher: item.publisher,
        date: item.date,
        originalUrl: item.originalUrl,
        category: item.category
      });
    }
    dated.sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
    const status = dated.length === 0
      ? (missingDateCount ? "missing_dates" : "not_found")
      : (missingDateCount ? "partial" : "ready");
    return response.json({ items: dated, status, missingDateCount });
  } catch (error) {
    console.error("관련 뉴스 타임라인 검색 실패:", error.message);
    const notConfigured = error.code === "NAVER_NOT_CONFIGURED";
    return response.status(notConfigured ? 503 : 502).json({
      error: {
        code: error.code || "TIMELINE_SEARCH_FAILED",
        message: notConfigured
          ? "네이버 뉴스 검색 인증 정보가 없어 관련 흐름을 불러올 수 없습니다."
          : "관련 뉴스 검색에 실패했습니다. 잠시 후 다시 시도해 주세요."
      }
    });
  }
});

router.get("/", async (request, response) => {
  const category = String(request.query.category || "전체");
  if (!Object.hasOwn(categoryQueries, category)) {
    return response.status(400).json({
      error: { code: "INVALID_CATEGORY", message: "지원하지 않는 뉴스 분야입니다." }
    });
  }

  const requestedLimit = Number.parseInt(request.query.limit, 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 20) : 10;

  const databasePromise = process.env.DATABASE_URL
    ? newsRepository.listNews(category, limit)
      .then((items) => ({ items, available: true }))
      .catch((error) => {
        console.error("뉴스 캐시 조회 실패:", error.message);
        return { items: [], available: false };
      })
    : Promise.resolve({ items: [], available: false });
  const searchPromise = searchNews({ query: categoryQueries[category], limit, category })
    .then((result) => ({ result }))
    .catch((error) => ({ error }));

  const [databaseResult, searchResult] = await Promise.all([databasePromise, searchPromise]);

  if (searchResult.result) {
    let items = searchResult.result.items;
    let storageStatus = !process.env.DATABASE_URL ? "not_configured" : "unavailable";
    let notice = !process.env.DATABASE_URL
      ? "검색 결과를 가져왔지만 DATABASE_URL이 없어 데이터베이스에 저장하지 않았습니다."
      : "검색 결과를 표시합니다. Neon 데이터베이스에 연결하지 못해 이번 결과를 저장하지 않았습니다.";
    let source = "naver";

    if (databaseResult.available) {
      try {
        await newsRepository.saveNews(items);
        items = await newsRepository.listNews(category, limit);
        storageStatus = "saved";
        source = "database";
        notice = "새 검색 결과를 Neon 데이터베이스에 저장하고 목록에 반영했습니다.";
      } catch (error) {
        console.error("뉴스 저장 실패:", error.message);
      }
    }

    return response.json({ category, items: await withCardSummaries(items), source, storageStatus, notice });
  }

  const error = searchResult.error;
  if (databaseResult.items.length > 0) {
    const searchNotice = error.code === "NAVER_NOT_CONFIGURED"
      ? "네이버 인증 정보가 없어 새 검색은 생략하고 저장된 뉴스 목록을 표시합니다."
      : "네이버 검색에 실패해 저장된 뉴스 목록을 표시합니다.";
    return response.json({
      category,
      items: await withCardSummaries(databaseResult.items),
      source: "database",
      storageStatus: "cached",
      notice: searchNotice
    });
  }

  if (error.code === "NAVER_NOT_CONFIGURED") {
    const message = !process.env.DATABASE_URL
      ? "네이버 인증 정보가 설정되지 않았고 DATABASE_URL도 없어 저장된 뉴스와 검색 결과를 불러올 수 없습니다."
      : "네이버 뉴스 검색 인증 정보가 설정되지 않았고 저장된 뉴스도 없습니다.";
    return response.status(503).json({
      error: { code: error.code, message }
    });
  }

  console.error("네이버 뉴스 검색 요청 실패:", error.message);
  const message = !process.env.DATABASE_URL
    ? "네이버 뉴스 검색에 연결하지 못했고 DATABASE_URL도 설정되지 않았습니다."
    : databaseResult.available
      ? "네이버 뉴스 검색에 연결하지 못했고 저장된 뉴스도 없습니다."
      : "네이버 뉴스 검색과 Neon 데이터베이스에 연결하지 못했습니다.";
  return response.status(502).json({
    error: { code: "NAVER_REQUEST_FAILED", message }
  });
});

module.exports = router;
