const { Pool } = require("pg");

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    });
    pool.on("error", (error) => {
      console.error("PostgreSQL 유휴 연결 오류:", error.message);
    });
  }
  return pool;
}

module.exports = { getPool };
