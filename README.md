# KIWI Juice

내부 그래픽 디자인 레퍼런스 아카이브 — Pinterest 스타일 매스메트리 갤러리.

- Next.js 16 (App Router, TypeScript)
- Supabase (Postgres + Storage)
- Tailwind CSS v4 + shadcn/ui (수동 설치)
- 매스메트리: react-masonry-css
- 배포: Vercel

## 1. 환경 변수

`.env.local.example`을 복사해서 `.env.local`을 채워주세요.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ARCHIVE_PASSWORD=
```

## 2. Supabase 셋업

1. 새 프로젝트를 만들고 `db/schema.sql`을 SQL 에디터에서 실행한다.
2. Storage에서 `refs`라는 이름의 **public** 버킷을 만든다.
3. Storage 정책을 `anon`이 `select/insert` 가능하도록 열어둔다 (앱 자체가 비번 게이트라서 RLS는 풀어둔다).
4. 위 환경변수에 URL과 anon key를 채운다.

## 3. 실행

```bash
pnpm install
pnpm dev
```

처음 들어가면 `/gate`로 리다이렉트된다. `ARCHIVE_PASSWORD`와 닉네임을 입력하면 30일 쿠키가 세팅되고 닉네임은 localStorage에 저장된다.

## 4. 라우트

| Path | 설명 |
| --- | --- |
| `/` | 인덱스 매스메트리 (필터: genre/medium/language/tag) |
| `/upload` | 다중 이미지 업로드 + 메타데이터 |
| `/ref/[id]` | 큰 이미지 + 메타 + 노트 (마크다운, 닉네임 일치 시 수정·삭제) |
| `/designer` | 디자이너 인덱스 |
| `/designer/new` | 새 디자이너 |
| `/designer/[slug]` | 디자이너의 작업 매스메트리 |
| `/tag/[name]` | 태그 모아보기 |
| `/gate` | 비번 + 닉네임 게이트 |
| `/api/auth` | 비번 체크, 30일 httpOnly 쿠키 set |

## 5. v2 이후로 미룬 것

- URL 자동 수집
- 색상 자동 추출 / 색상 검색
- OCR
- 임베딩 유사도
- 썸네일 자동 리사이즈 (현재는 원본 사용)
