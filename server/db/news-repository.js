const { getPool } = require("./pool");

function getDatabase() {
  const pool = getPool();
  if (!pool) {
    const error = new Error("DATABASE_URL is not configured");
    error.code = "DATABASE_NOT_CONFIGURED";
    throw error;
  }
  return pool;
}

async function listNews(category, limit) {
  const pool = getDatabase();
  const result = category === "전체"
    ? await pool.query(
      `SELECT id, title, category, publisher, published_at, original_url, summary, created_at
       FROM news_articles
       ORDER BY published_at DESC NULLS LAST, created_at DESC
       LIMIT $1`,
      [limit]
    )
    : await pool.query(
      `SELECT id, title, category, publisher, published_at, original_url, summary, created_at
       FROM news_articles
       WHERE category = $1
       ORDER BY published_at DESC NULLS LAST, created_at DESC
       LIMIT $2`,
      [category, limit]
    );

  return result.rows.map((row) => ({
    id: String(row.id),
    title: row.title,
    summary: row.summary,
    publisher: row.publisher,
    date: row.published_at ? new Date(row.published_at).toISOString() : null,
    originalUrl: row.original_url,
    imageUrl: null,
    category: row.category,
    createdAt: new Date(row.created_at).toISOString()
  }));
}

async function saveNews(items) {
  if (items.length === 0) return;
  const pool = getDatabase();
  const values = [];
  const rows = items.map((item, index) => {
    const offset = index * 6;
    values.push(item.title, item.category, item.publisher, item.date, item.originalUrl, item.summary);
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
  });

  await pool.query(
    `INSERT INTO news_articles (title, category, publisher, published_at, original_url, summary)
     VALUES ${rows.join(", ")}
     ON CONFLICT (original_url) DO UPDATE SET
       title = EXCLUDED.title,
       category = EXCLUDED.category,
       publisher = EXCLUDED.publisher,
       published_at = EXCLUDED.published_at,
       summary = EXCLUDED.summary`,
    values
  );
}

module.exports = { listNews, saveNews };
