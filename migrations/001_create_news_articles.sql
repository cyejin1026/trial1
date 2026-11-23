CREATE TABLE IF NOT EXISTS news_articles (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('전체', '정치', '경제', '사회', '문화', 'IT')),
  publisher TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  original_url TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS news_articles_category_published_at_idx
  ON news_articles (category, published_at DESC);
