# 오늘의 뉴스

‘오늘의 뉴스’ 웹 서비스입니다. 분야별 화면은 Express 백엔드의 네이버 뉴스 검색 엔드포인트를 사용하며, 검색 결과는 Neon(PostgreSQL)에 중복 없이 저장합니다. OpenAI Responses API로 제공된 검색 정보만 요약하고, 뉴스별 질문에 답합니다.

## 실행

필요한 환경은 Node.js 18 이상과 npm입니다.

```sh
npm install
npm run dev
```

개발 서버는 기본적으로 <http://localhost:3000>에서 실행됩니다. 운영 형태로 실행하려면 `npm start`를 사용합니다. `PORT` 환경 변수로 포트를 바꿀 수 있습니다.

브라우저에서 `/`를 열어 화면을 확인하고, `/api/health`에서 `{ "status": "ok" }` 응답을 확인할 수 있습니다. 별도의 프론트엔드 빌드 서버는 없으며 Express가 `public/`의 HTML, CSS, JavaScript를 제공합니다.

## 환경 변수

`.env.example`을 참고해 프로젝트 루트에 `.env`를 만들고 실제 발급받은 값을 로컬에서 입력합니다. `.env`는 Git에 포함하지 않습니다. API 키와 데이터베이스 URL을 코드나 저장소에 올리지 마세요.

| 변수 | 용도 |
| --- | --- |
| `PORT` | Express 서버 포트 (기본값 `3000`) |
| `DATABASE_URL` | Neon PostgreSQL pooled 접속 문자열 |
| `NAVER_API_HUB_CLIENT_ID` | 네이버 뉴스 검색 API 클라이언트 ID |
| `NAVER_API_HUB_CLIENT_SECRET` | 네이버 뉴스 검색 API 클라이언트 시크릿 |
| `NAVER_DEVELOPERS_CLIENT_ID` | 기존 네이버 개발자센터 검색 API 클라이언트 ID |
| `NAVER_DEVELOPERS_CLIENT_SECRET` | 기존 네이버 개발자센터 검색 API 클라이언트 시크릿 |
| `NAVER_PROVIDER` | 사용할 provider: `hub` (기본값) 또는 `developers` |
| `OPENAI_API_KEY` | OpenAI API 인증 키 (Express 서버 전용) |
| `OPENAI_MODEL` | Responses API와 Structured Outputs를 지원하는 모델 이름 |

서버는 `dotenv`로 루트 `.env`를 읽습니다. 네이버 인증값과 `DATABASE_URL`은 Express 서버에서만 읽으며 브라우저에 전달하지 않습니다. `NAVER_PROVIDER`를 설정하지 않으면 `hub`를 사용합니다. HUB 인증값은 기존 `.env`의 `NAVER_API_HUB_CLIENT_ID`와 `NAVER_API_HUB_CLIENT_SECRET`을 사용할 수 있습니다. 개발자센터 provider를 선택하면 `NAVER_DEVELOPERS_CLIENT_ID`와 `NAVER_DEVELOPERS_CLIENT_SECRET`을 설정하세요.

OpenAI 연결은 공식 `openai` Node.js 라이브러리와 Responses API를 사용합니다. `OPENAI_API_KEY`와 `OPENAI_MODEL`을 `.env`에 설정하면 Express가 뉴스 카드 요약과 `POST /api/chat` 답변을 생성합니다. 키는 서버에서만 읽고 브라우저로 보내지 않습니다. API 키 또는 모델 설정이 없거나 요청이 실패하면 뉴스 목록은 네이버 검색 결과를 계속 보여주며, 카드에는 검색 제공 요약이 대체로 표시됩니다. 챗봇은 설정 오류 또는 요청 오류 상태를 안내합니다.

카드 요약은 검색 결과의 제목, 검색 요약, 언론사, 날짜만 사용하며 원문 기사를 가져오지 않습니다. 정보가 부족하면 그 사실을 표시하고 카드에 원문 링크를 제공합니다. 요약 원문은 데이터베이스의 검색 요약으로 보존하고, 생성 요약을 검색 원문으로 저장하지 않습니다. 상세 화면 챗봇은 현재 화면의 검색 자료와 최대 3건의 관련 뉴스만 입력으로 받습니다. 답을 자료에서 확인할 수 없으면 확인 불가로 답하고, 인용 링크는 서버가 검증한 제공 자료에서 생성합니다. 질문은 최대 500자, JSON 요청은 24 KB, 대화 이력은 최대 8개 항목이며 IP별 요청 수는 분당 10회로 제한합니다.

분야별 뉴스 요청은 `GET /api/news?category=정치&limit=10` 형식입니다. `category`는 `전체`, `정치`, `경제`, `사회`, `문화`, `IT` 중 하나이며 `limit`은 최대 20입니다. 결과의 공통 형식은 `title`, `summary`, `publisher`, `date`, `originalUrl`, `imageUrl`, `category`입니다. 네이버 API 응답에는 언론사명이나 이미지 URL이 없으므로 `publisher`는 원문 주소의 호스트명으로 정하고 `imageUrl`은 `null`로 둡니다. 검색 API가 제공하지 않는 기사 본문을 임의로 만들지 않습니다. API가 인증되지 않았거나 요청이 실패하면 화면은 이해 가능한 안내와 함께 Neon에 저장된 뉴스가 있으면 캐시 결과를, 없으면 분야별 예시 데이터를 표시합니다.

상세 화면의 관련 흐름은 `GET /api/news/:id/timeline?title=...&summary=...&category=...&originalUrl=...`로 검색합니다. 기존 선택된 네이버 provider와 공통 결과 정규화 모듈을 재사용하며, 현재 기사 원문은 제외하고 원문 링크가 있는 검색 결과 중 날짜가 확인된 항목만 오래된 날짜부터 반환합니다. 검색 결과 요약은 별도 사실을 덧붙이지 않고 설명으로 표시합니다. 날짜가 없는 결과는 시간순을 정할 수 없어 제외하고, 제외 건수를 함께 반환합니다.

## Neon 데이터베이스

Neon 콘솔에서 프로젝트의 **Connect** 메뉴를 열어 pooled connection string을 복사해 루트 `.env`의 `DATABASE_URL`에 넣습니다. Neon의 `-pooler` 호스트를 포함한 앱용 연결 문자열을 그대로 사용하고, 생성된 TLS 옵션(`sslmode=require` 및 제공되는 경우 `channel_binding=require`)을 유지하세요. 접속 문자열을 코드나 프론트엔드에 넣지 않습니다.

뉴스 테이블 스키마를 처음 만들거나 현재 스키마를 다시 적용하려면 다음을 실행합니다.

```sh
npm run db:migrate
```

마이그레이션은 [001_create_news_articles.sql](migrations/001_create_news_articles.sql)에 있습니다. `news_articles` 테이블은 제목, 분야, 언론사, 발행 시각, 원문 URL, 요약, 생성 시각과 내부 ID만 저장합니다. `original_url`은 `UNIQUE`이며, 새 검색 결과는 같은 URL이면 기존 행을 갱신하는 방식으로 저장됩니다. 분야·발행 시각 복합 인덱스로 목록 조회를 지원합니다. 향후 변경은 순번이 있는 SQL migration 파일을 추가하고 `npm run db:migrate -- 002_your_change.sql`처럼 파일명을 지정해 적용합니다.

뉴스 목록 요청은 새 검색 결과를 조회해 DB에 upsert하고, 저장이 성공하면 DB의 최신 목록을 응답합니다. 네이버 검색이 실패하면 DB에 저장된 목록이 있는 경우 해당 목록으로 대체합니다. `DATABASE_URL`이 없거나 DB 연결·스키마 적용이 실패해도 네이버 검색 결과를 그대로 반환하며, 저장할 수 없다는 안내를 화면에 표시합니다. DB와 검색 API를 모두 사용할 수 없을 때는 분야별 예시 데이터가 표시됩니다.

뉴스 API provider 코드는 `server/providers/naver/`에 분리되어 있습니다. NAVER API HUB는 `GET https://naverapihub.apigw.ntruss.com/search/v1/news`와 `X-NCP-APIGW-API-KEY-ID`, `X-NCP-APIGW-API-KEY` 헤더를 사용합니다. 개발자센터 provider는 `GET https://openapi.naver.com/v1/search/news.json`과 `X-Naver-Client-Id`, `X-Naver-Client-Secret` 헤더를 사용합니다. provider 전환은 `.env`의 `NAVER_PROVIDER` 설정으로 처리합니다.

## 폴더와 파일

```text
.
├── public/
│   ├── index.html       # 프론트엔드 문서와 앱 시작점
│   ├── css/styles.css   # 화면 스타일
│   └── js/
│       ├── app.js       # 분야 필터, 목록·상세 화면 라우팅
│       └── news-data.js # 교체하기 쉬운 예시 뉴스 데이터
├── server/
│   ├── routes/news.js   # 분야별 검색과 관련 타임라인 API
│   ├── routes/chat.js   # 뉴스 자료 기반 챗봇 엔드포인트
│   ├── services/openai.js # OpenAI 요약과 근거 기반 답변
│   ├── providers/naver/ # HUB/개발자센터 provider와 결과 공통화
│   └── db/              # PostgreSQL Pool과 뉴스 저장소
├── migrations/          # 데이터베이스 스키마 SQL
├── scripts/migrate.js   # npm run db:migrate 실행 스크립트
├── server.js            # Express 서버와 API 엔드포인트
├── .env.example         # 비밀값 없는 환경 변수 이름 목록
├── .gitignore           # 비밀 환경 파일과 설치 파일 제외
└── package.json         # 실행 스크립트와 서버 의존성
```

## 최소 의존성

- `express`: 정적 프론트엔드 제공과 향후 백엔드 API 라우트 구성을 위해 사용합니다.
- `dotenv`: Node.js 프로세스에서 로컬 `.env` 변수를 읽기 위해 사용합니다.
- `pg`: Express 서버에서 Neon PostgreSQL로 연결하고 parameterized query를 실행합니다.
- `openai`: 공식 Node.js SDK로 서버의 Responses API 요청과 구조화된 결과를 처리합니다.
