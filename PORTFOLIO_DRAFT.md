# KIWI Juice

내부 그래픽 디자인 레퍼런스 아카이브 — Pinterest 스타일 매스메트리 갤러리.

팀 안에서 모아둔 그래픽 디자인 레퍼런스를 한곳에 쌓고 다시 찾기 위해 만든 내부 아카이브다. 로그인 시스템을 따로 두는 대신 단일 비밀번호 게이트와 닉네임으로 접근을 단순화했고, 데이터와 이미지는 Supabase(Postgres + Storage)에 맡겨 별도 백엔드 없이 운영한다. 인덱스는 react-masonry-css로 매스메트리 그리드를 구성하고 genre·medium·language·tag로 필터링하며, UI는 Tailwind v4 위에 shadcn/ui 컴포넌트를 수동 설치해 쌓았다. 그 결과 다중 이미지 업로드, 레퍼런스 상세(마크다운 노트), 디자이너·태그 인덱스로 이어지는 라우트를 갖춘 아카이브로 동작한다.

---

**역할** · 기획·개발 (프론트엔드 + Supabase 데이터/스토리지 연동) — *솔로/팀 여부는 확인 후 보정 필요*

**스택** · Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS v4 · Supabase(Postgres + Storage) · 배포 Vercel

**주요 의존성** (코드 확인)
- 데이터/인증: `@supabase/supabase-js`, `@supabase/ssr`
- UI: Radix UI(`react-dialog`, `react-dropdown-menu`, `react-select`, `react-label`, `react-slot`), `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`
- 갤러리/폼: `react-masonry-css`, `react-hook-form` + `@hookform/resolvers` + `zod`, `react-markdown`
- 이미지/부가: `colorthief`(색상 추출), `tesseract.js`(OCR), `@fullcalendar/*`(캘린더)

**링크** · 라이브: *(URL 입력 필요)* · 리포: `github.com/h2j603/ck-ref`
