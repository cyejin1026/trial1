require("dotenv").config();

const express = require("express");
const path = require("node:path");
const newsRouter = require("./server/routes/news");
const chatRouter = require("./server/routes/chat");

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicDirectory = path.join(__dirname, "public");

app.use(express.json({ limit: "24kb" }));
app.use("/api/news", newsRouter);
app.use("/api/chat", chatRouter);
app.use(express.static(publicDirectory));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use((error, _request, response, _next) => {
  if (error.type === "entity.too.large") {
    return response.status(413).json({ error: { code: "REQUEST_TOO_LARGE", message: "요청 내용이 너무 큽니다. 질문과 대화 이력을 줄여 다시 시도해 주세요." } });
  }
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return response.status(400).json({ error: { code: "INVALID_JSON", message: "요청 형식을 확인해 주세요." } });
  }
  console.error("요청 처리 실패:", error.message);
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." } });
});

app.listen(port, () => {
  console.log(`오늘의 뉴스 서버가 http://localhost:${port} 에서 실행 중입니다.`);
});
