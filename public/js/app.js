const app = document.querySelector("#app");
const categories = ["전체", "정치", "경제", "사회", "문화", "IT"];
let selectedCategory = "전체";
let newsItems = [];
let isLoading = false;
let usingSamples = true;
let fetchError = null;
let apiNotice = null;
let storageStatus = null;
let activeRequestId = 0;
const chatByArticle = new Map();
const timelineByArticle = new Map();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function displayDate(value) {
  if (!value) return "날짜 정보 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 정보 없음";
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(date);
}

function dateTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function fullDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 정보 없음";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function toSampleView(item) {
  return { ...item, imageUrl: item.image, summaryLines: item.summary, isSample: true };
}

function sampleItems(category) {
  return TODAY_NEWS.filter((item) => category === "전체" || item.category === category).map(toSampleView);
}

function toApiView(item) {
  return { ...item, providedSummary: item.summary || "", summaryLines: item.cardSummary ? [item.cardSummary] : (item.summary ? [item.summary] : []), body: [], timeline: [], imageAlt: "대표 이미지를 제공하지 않는 뉴스입니다.", isSample: false };
}

function sourceSummary(item) {
  return item.providedSummary || (Array.isArray(item.summary) ? item.summary.join(" ") : item.summary) || "";
}

function chatState(id) {
  if (!chatByArticle.has(id)) chatByArticle.set(id, { messages: [], pending: false, error: "", inputError: "" });
  return chatByArticle.get(id);
}

function renderChat(item) {
  const state = chatState(item.id);
  const messages = state.messages.map((message) => `<div class="chat-message is-${message.role}"><span class="chat-message-label">${message.role === "user" ? "내 질문" : "뉴스 어시스턴트"}</span><p>${escapeHtml(message.content)}</p>${message.sources?.length ? `<div class="chat-citations">참고 기사 ${message.sources.map((source, index) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${index + 1}. ${escapeHtml(source.title || "원문 보기")}</a>`).join("")}</div>` : ""}</div>`).join("");
  return `<section class="chat-panel" aria-labelledby="chat-heading"><div class="chat-heading-row"><div><p class="section-kicker">ASK ABOUT THIS STORY</p><h2 id="chat-heading">뉴스와 대화하기</h2></div><span class="chat-context-badge">이 기사 기준</span></div><p class="chat-description">검색 결과에 제공된 제목·요약·출처와 관련 뉴스만 참고합니다. 자료에서 확인되지 않는 내용은 확인할 수 없다고 답합니다.</p><div class="chat-transcript" aria-live="polite">${messages || `<p class="chat-empty">이 뉴스에 대해 질문해 보세요. 답변에는 참고한 원문 링크가 표시됩니다.</p>`}${state.pending ? `<div class="chat-pending" role="status"><span class="notice-dot"></span> 제공된 자료를 확인하고 있습니다…</div>` : ""}${state.inputError ? `<p class="chat-error" role="alert">${escapeHtml(state.inputError)}</p>` : ""}${state.error ? `<p class="chat-error" role="alert">${escapeHtml(state.error)}</p>` : ""}</div><form class="chat-input" data-chat-form="${escapeHtml(item.id)}"><input name="question" type="text" maxlength="500" placeholder="궁금한 내용을 물어보세요 (최대 500자)" aria-label="궁금한 내용" ${state.pending ? "disabled" : ""} /><button type="submit" aria-label="전송" ${state.pending ? "disabled" : ""}>↑</button></form><span class="chat-footnote">질문은 이 뉴스 화면에만 연결되어 보관됩니다. 답변은 제공된 검색 자료만 근거로 합니다.</span></section>`;
}

function chatContext(item) {
  const pack = (news) => ({ title: news.title, summary: sourceSummary(news), publisher: news.publisher, date: news.date, originalUrl: news.originalUrl, category: news.category });
  return {
    article: pack(item),
    relatedNews: newsItems.filter((news) => news.id !== item.id).slice(0, 3).map(pack)
  };
}

function attachChat(item) {
  const form = app.querySelector("[data-chat-form]");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const state = chatState(item.id);
    const field = form.elements.question;
    const question = field.value.trim();
    state.inputError = "";
    state.error = "";
    if (!question) {
      state.inputError = "질문을 입력해 주세요.";
      renderRoute(false);
      return;
    }
    if (question.length > 500) {
      state.inputError = "질문은 500자 이내로 입력해 주세요.";
      renderRoute(false);
      return;
    }
    const history = state.messages.slice(-8).map(({ role, content }) => ({ role, content }));
    state.messages.push({ role: "user", content: question });
    state.pending = true;
    renderRoute(false);
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, ...chatContext(item), history })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "답변을 불러오지 못했습니다.");
      state.messages.push({ role: "assistant", content: payload.answer, sources: payload.citations || [] });
    } catch (error) {
      state.error = error.message || "뉴스 답변을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    } finally {
      state.pending = false;
      renderRoute(false);
    }
  });
}

function timelineState(id) {
  if (!timelineByArticle.has(id)) timelineByArticle.set(id, { status: "loading", requestStarted: false, items: [], missingDateCount: 0, error: "" });
  return timelineByArticle.get(id);
}

function renderTimeline(item) {
  const state = timelineState(item.id);
  const label = state.status === "loading" ? "검색 중" : state.status === "error" ? "확인 필요" : "검색 결과";
  let content;
  if (state.status === "loading") {
    content = `<p class="timeline-empty" role="status">현재 뉴스의 제목과 주제로 관련 기사를 찾고 있습니다.</p>`;
  } else if (state.status === "error") {
    content = `<p class="timeline-empty" role="alert">${escapeHtml(state.error)}</p>`;
  } else if (state.status === "missing_dates") {
    content = `<p class="timeline-empty">관련 기사는 찾았지만 날짜 정보가 없어 시간순으로 표시할 수 없습니다.</p>`;
  } else if (!state.items.length) {
    content = `<p class="timeline-empty">확인 가능한 날짜가 있는 관련 뉴스를 찾지 못했습니다.</p>`;
  } else {
    content = `<ol class="timeline-list">${state.items.map((entry) => `<li><span class="timeline-dot"></span><time datetime="${escapeHtml(dateTimeValue(entry.date))}">${escapeHtml(fullDate(entry.date))}</time><p class="timeline-event-title">${escapeHtml(entry.title)}</p><p class="timeline-description">${escapeHtml(entry.description)}</p><div class="timeline-source"><span>${escapeHtml(entry.publisher || "언론사 정보 없음")}</span><a href="${escapeHtml(entry.originalUrl)}" target="_blank" rel="noopener noreferrer">원문 기사 <span aria-hidden="true">↗</span></a></div></li>`).join("")}</ol>${state.missingDateCount ? `<p class="timeline-footnote">날짜가 없는 관련 기사 ${state.missingDateCount}건은 순서를 정할 수 없어 제외했습니다.</p>` : `<p class="timeline-footnote">기사별 검색 날짜 기준으로 오래된 사건부터 정렬했습니다. 설명은 각 검색 결과를 그대로 요약해 표시합니다.</p>`}`;
  }
  return `<section class="timeline-panel"><div class="aside-title"><span class="section-kicker">THE BIGGER PICTURE</span><h2>관련 흐름</h2><span class="timeline-label">${label}</span></div>${content}</section>`;
}

async function loadTimeline(item) {
  const state = timelineState(item.id);
  if (state.status !== "loading" || state.requestStarted) return;
  state.requestStarted = true;
  const params = new URLSearchParams({
    title: item.title,
    summary: sourceSummary(item),
    category: item.category || "전체",
    originalUrl: item.originalUrl || ""
  });
  try {
    const response = await fetch(`/api/news/${encodeURIComponent(item.id)}/timeline?${params}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "관련 뉴스 검색을 완료하지 못했습니다.");
    state.items = Array.isArray(payload.items) ? payload.items : [];
    state.missingDateCount = Number(payload.missingDateCount) || 0;
    state.status = payload.status === "missing_dates" ? "missing_dates" : state.items.length ? "ready" : "empty";
  } catch (error) {
    state.status = "error";
    state.error = error.message || "관련 뉴스 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (window.location.hash === `#/news/${item.id}`) renderRoute(false);
}

function imageMarkup(item, className) {
  if (item.imageUrl) {
    return `<img class="${className}" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.imageAlt || "뉴스 대표 이미지")}" loading="lazy" />`;
  }
  return `<div class="${className}-placeholder" role="img" aria-label="대표 이미지 없음"><span>NEWS / ${escapeHtml(item.category)}</span><b>오늘의<br />이야기</b><i aria-hidden="true">N.</i></div>`;
}

function renderNotice() {
  if (isLoading) return `<div class="api-notice is-loading" role="status"><span class="notice-dot"></span> 네이버 뉴스 검색 중입니다. 연결되는 동안 예시 뉴스를 표시합니다.</div>`;
  if (fetchError) return `<div class="api-notice" role="status"><span class="notice-dot"></span><span>${escapeHtml(fetchError)} 예시 뉴스를 표시합니다.</span></div>`;
  if (usingSamples) return `<div class="api-notice is-sample" role="status"><span class="notice-dot"></span> 예시 데이터로 표시 중입니다. 서버에서 네이버 검색 인증을 설정하면 실제 검색 결과가 표시됩니다.</div>`;
  const noticeClass = storageStatus === "saved" ? "is-live" : "is-sample";
  return `<div class="api-notice ${noticeClass}" role="status"><span class="notice-dot"></span><span>${escapeHtml(apiNotice || "네이버 뉴스 검색 결과를 표시합니다.")}</span></div>`;
}

function renderHome() {
  const visibleNews = newsItems;
  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow"><span class="live-dot"></span> 오늘의 브리핑 <span class="eyebrow-divider">/</span> ${new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date())}</p>
        <h1>오늘의 흐름을<br /><span>한눈에 읽다.</span></h1>
        <p class="hero-description">놓치면 아쉬운 오늘의 이야기,<br class="mobile-break" /> 중요한 맥락만 모았습니다.</p>
      </div>
      <div class="hero-aside"><span class="aside-index">01 <i>—</i> DAILY EDITION</span><p>세상의 소식을<br />당신의 속도로.</p><span class="aside-caption">하루를 여는 뉴스 큐레이션</span></div>
      <span class="hero-decoration" aria-hidden="true">N.</span>
    </section>
    <section class="news-section" aria-labelledby="news-heading">
      <div class="section-heading"><div><p class="section-kicker">CURATED FOR YOU</p><h2 id="news-heading">오늘의 주요 뉴스 <span class="count">${String(visibleNews.length).padStart(2, "0")}</span></h2></div><p class="section-date">TODAY <span>${new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(new Date()).replace(". ", ".")}</span></p></div>
      <nav class="category-nav" aria-label="뉴스 분야 선택">${categories.map((category) => `<button class="category-chip ${selectedCategory === category ? "is-selected" : ""}" type="button" data-category="${category}" aria-pressed="${selectedCategory === category}">${category}</button>`).join("")}</nav>
      ${renderNotice()}
      <div class="news-grid">${visibleNews.map((item, index) => `
        <article class="news-card ${index === 0 ? "news-card-featured" : ""}">
          <a class="card-detail-link" href="#/news/${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)} 상세 보기"><div class="card-image-wrap">${imageMarkup(item, "card-image")}<span class="card-category">${escapeHtml(item.category)}</span><span class="card-arrow" aria-hidden="true">↗</span></div></a>
          <div class="card-content"><div class="card-meta"><span>${escapeHtml(item.publisher)}</span><i></i><time datetime="${escapeHtml(dateTimeValue(item.date))}">${escapeHtml(displayDate(item.date))}</time></div><a class="card-title-link" href="#/news/${escapeHtml(item.id)}"><h3>${escapeHtml(item.title)}</h3></a><p class="card-summary">${escapeHtml((item.summaryLines || []).join(" "))}</p>${item.summaryInsufficient ? `<p class="summary-limited">제공된 정보가 제한적입니다. 원문에서 확인해 주세요.</p>` : ""}<div class="card-actions"><a class="read-more" href="#/news/${escapeHtml(item.id)}">요약 보기 <span aria-hidden="true">→</span></a>${item.originalUrl && /^https?:\/\//i.test(item.originalUrl) ? `<a class="original-link" href="${escapeHtml(item.originalUrl)}" target="_blank" rel="noopener noreferrer">원문 기사 <span aria-hidden="true">↗</span></a>` : `<span class="original-link is-unavailable">원문 링크 없음</span>`}</div></div>
        </article>`).join("")}
      </div>
      ${visibleNews.length === 0 ? `<p class="empty-state">선택한 분야의 검색 결과가 없습니다. 다른 분야를 선택해 보세요.</p>` : ""}
      <p class="demo-note"><span aria-hidden="true">✳</span> 검색 API는 기사 제목과 요약 문구를 제공합니다. 기사 본문과 이미지는 제공하지 않습니다.</p>
    </section>`;

  app.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
    selectedCategory = button.dataset.category;
    newsItems = sampleItems(selectedCategory);
    isLoading = true;
    fetchError = null;
    usingSamples = true;
    renderHome();
    fetchNews(selectedCategory);
  }));
}

function renderDetail(id) {
  const item = newsItems.find((news) => news.id === id);
  if (!item) {
    app.innerHTML = isLoading
      ? `<section class="not-found" role="status"><p class="section-kicker">LOADING</p><h1>뉴스를 불러오고 있습니다.</h1></section>`
      : `<section class="not-found"><p class="section-kicker">PAGE NOT FOUND</p><h1>뉴스를 찾을 수 없습니다.</h1><a class="text-link" href="#/">← 뉴스 목록으로</a></section>`;
    return;
  }
  const summaryLines = item.summaryLines || [];
  const bodyContent = item.body?.length
    ? `${item.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}<p class="body-disclaimer">이 본문은 화면 구성을 위한 예시입니다. 실제 기사 원문은 출처 링크에서 확인할 수 있습니다.</p>`
    : `<p class="body-unavailable">네이버 뉴스 검색 API는 기사 본문을 제공하지 않습니다. 원문 링크에서 기사 전체를 확인해 주세요.</p>`;
  const related = newsItems.filter((news) => news.id !== item.id && news.category === item.category).slice(0, 3);
  const articleLink = item.originalUrl && /^https?:\/\//i.test(item.originalUrl)
    ? `<a href="${escapeHtml(item.originalUrl)}" target="_blank" rel="noopener noreferrer">원문 기사 보기 <span aria-hidden="true">↗</span></a>`
    : `<span class="source-missing">원문 링크 없음</span>`;

  app.innerHTML = `
    <div class="detail-topline"><a class="back-link" href="#/"><span aria-hidden="true">←</span> 전체 뉴스</a><span class="detail-edition">TODAY'S BRIEFING <i></i> ${escapeHtml(item.category)}</span></div>
    <article class="article-layout"><div class="article-main">
      <header class="article-header"><div class="article-meta"><span class="article-category">${escapeHtml(item.category)}</span><span>${escapeHtml(item.publisher)}</span><i></i><time datetime="${escapeHtml(dateTimeValue(item.date))}">${escapeHtml(displayDate(item.date))}</time></div><h1>${escapeHtml(item.title)}</h1><p class="article-deck">${escapeHtml(summaryLines[0] || "검색 요약이 제공되지 않았습니다.")}</p><div class="source-line"><span>기사 출처</span><strong>${escapeHtml(item.publisher)}</strong>${articleLink}</div></header>
      <figure class="article-figure">${imageMarkup(item, "article-image")}<figcaption>${escapeHtml(item.imageCaption || "네이버 뉴스 검색 결과")}${item.isSample ? " <span>· 예시 이미지</span>" : " <span>· 이미지 정보 없음</span>"}</figcaption></figure>
      <section class="article-section summary-section"><div class="article-section-title"><span class="section-number">01</span><h2>핵심 요약</h2><span class="title-rule"></span></div><ul class="summary-list">${summaryLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></section>
      <section class="article-section body-section"><div class="article-section-title"><span class="section-number">02</span><h2>기사 본문</h2><span class="title-rule"></span></div><div class="article-body">${bodyContent}</div></section>
      ${renderChat(item)}
    </div><aside class="article-aside">${renderTimeline(item)}
      ${related.length ? `<section class="related-panel"><p class="section-kicker">READ NEXT</p><h2>함께 읽기</h2>${related.map((news) => `<a class="related-item" href="#/news/${escapeHtml(news.id)}"><span>${escapeHtml(news.category)}</span><strong>${escapeHtml(news.title)}</strong><i aria-hidden="true">↗</i></a>`).join("")}</section>` : ""}</aside></article>
    <div class="detail-bottom"><a class="back-link" href="#/"><span aria-hidden="true">←</span> 오늘의 뉴스 더 보기</a><span>${item.isSample ? "화면 구성용 예시 데이터입니다." : "기사 본문과 이미지는 검색 API에서 제공되지 않습니다."}</span></div>`;
  attachChat(item);
  loadTimeline(item);
}

function renderRoute(scrollToTop = true) {
  const match = window.location.hash.match(/^#\/news\/([\w-]+)$/);
  if (match) renderDetail(match[1]);
  else renderHome();
  if (scrollToTop) window.scrollTo({ top: 0, behavior: "instant" });
}

async function fetchNews(category) {
  const requestId = ++activeRequestId;
  const params = new URLSearchParams({ category, limit: "10" });
  try {
    const response = await fetch(`/api/news?${params}`);
    const payload = await response.json();
    if (requestId !== activeRequestId) return;
    if (!response.ok) {
      const code = payload?.error?.code;
      fetchError = payload?.error?.message || (code === "NAVER_NOT_CONFIGURED"
        ? "서버에 네이버 API 인증 정보가 없어"
        : "네이버 뉴스 검색에 연결하지 못해");
      throw new Error(code || "NEWS_SEARCH_FAILED");
    }
    newsItems = (payload.items || []).map(toApiView);
    usingSamples = false;
    fetchError = null;
    apiNotice = payload.notice || "네이버 뉴스 검색 결과를 표시합니다.";
    storageStatus = payload.storageStatus || "unavailable";
  } catch (error) {
    if (requestId !== activeRequestId) return;
    if (!fetchError) fetchError = "뉴스 검색 서버에 연결하지 못해";
    newsItems = sampleItems(category);
    usingSamples = true;
    storageStatus = null;
    apiNotice = null;
  } finally {
    if (requestId !== activeRequestId) return;
    isLoading = false;
    renderRoute();
  }
}

window.addEventListener("hashchange", renderRoute);
newsItems = sampleItems(selectedCategory);
isLoading = true;
renderRoute();
fetchNews(selectedCategory);
