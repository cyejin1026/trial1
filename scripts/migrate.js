require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { getPool } = require("../server/db/pool");

async function migrate() {
  const pool = getPool();
  if (!pool) {
    throw new Error("DATABASE_URL을 .env에 설정한 뒤 마이그레이션을 실행하세요.");
  }

  try {
    const migrationName = process.argv[2] || "001_create_news_articles.sql";
    if (!/^\d{3}_[a-z0-9_-]+\.sql$/i.test(migrationName)) {
      throw new Error("순번이 포함된 migrations SQL 파일명을 지정하세요.");
    }
    const migrationPath = path.join(__dirname, "..", "migrations", migrationName);
    const sql = await fs.readFile(migrationPath, "utf8");
    await pool.query(sql);
    console.log("뉴스 테이블 스키마를 적용했습니다.");
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("스키마 적용 실패:", error.message);
  process.exitCode = 1;
});
