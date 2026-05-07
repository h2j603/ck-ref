# GridMaker 시스템 요약 (ck-ref)

다른 에이전트가 비슷한 서비스를 만들 수 있도록 핵심 패턴 위주로 정리한 핸드오프 문서.

---

## 1. 무엇을 하는 시스템인가

레퍼런스 이미지(포스터/에디토리얼/웹) 위에 **Müller-Brockmann 스타일 구조 그리드**를 얹어 레이아웃을 분석·재사용하는 도구. AI가 그리드를 추론하지 않음 — **사람이 슬라이더/클릭으로 직접 측정**하고, 그 스펙을 다른 레퍼런스나 프로젝트에 복사·적용.

핵심 동사: **분석(Analyze) → 저장(Save) → 갤러리에서 발견(Browse) → 적용(Apply, 복사)**.

---

## 2. 도메인 모델

### GridSpec (공통 코어, `lib/types.ts:100-116`)

```ts
grid_type: "columnar" | "modular" | "manuscript" | "custom"
cols, rowscount: 1–32
margin_top/right/bottom/left: 0–1   // 이미지 비율 기준 fraction
gutter_x, gutter_y: 0–1
baseline: number | null
custom_v: number[]                  // 0–1 위치 배열 (수직선)
custom_h: number[]                  // 0–1 위치 배열 (수평선)
label, notes
color: "dark" | "light"
```

**핵심 결정**: 모든 좌표를 **픽셀이 아니라 0–1 fraction**으로 저장 → 이미지가 바뀌어도 그리드가 살아남고, 다른 화면비에 적용 가능.

### 두 개의 테이블 (`db/schema.sql`)

| 테이블 | 부착 대상 | 특이점 |
|---|---|---|
| `ref_grids` | `refs.id` | 편집 가능. `image_path`가 NULL이면 cover에 적용 |
| `project_grids` | `projects.id` | 읽기 전용. `source_ref_id`, `source_image_path`, `source_width/height`를 같이 저장해서 원본 ref 이미지 위에 미리보기 |

두 테이블 모두 `source_grid_id UUID NULL` — **계보 추적**용. NULL이면 original, 값이 있으면 복사본.

---

## 3. URL / 엔트리 구조

| 라우트 | 파일 | 역할 |
|---|---|---|
| `/grids` | `app/grids/page.tsx` + `GridGalleryClient.tsx` | 갤러리. **originals만(`source_grid_id IS NULL`)** 표시 + 적용 카운트 |
| `/ref/[id]` | `app/ref/[id]/page.tsx` | 포스터/에디토리얼/웹 장르일 때만 `<GridAnalyzer>` lazy-load. 편집 가능 |
| `/wip/[id]` | `app/wip/[id]/page.tsx` + `ProjectGrids.tsx` | 프로젝트에 임포트된 그리드 미리보기 |
| `?from_grid=<id>` | 쿼리 파라미터 | "Apply" 흐름의 핵심. 타겟 페이지에서 에디터 프리필 |

**Apply 흐름**:

1. ref 디테일에서 `ApplyGridDialog`로 타겟(다른 ref 또는 project) 검색
2. 타겟에 `?from_grid=<id>` 붙여 navigate
3. 타겟 에디터가 spec 프리필
4. 사용자가 새 이미지에 맞춰 조정
5. 저장 시 `source_grid_id`가 자동으로 박힘 (계보 유지)

---

## 4. UI 컴포넌트 계층

`components/detail/GridAnalyzer.tsx` 한 파일에 거의 전부 들어있음:

- **GridEditor** (484-728): type 버튼, cols/rows stepper, margin/gutter slider, baseline 토글
- **GridPreview** (732-891): 이미지 위 오버레이. custom 모드에서 클릭=라인 추가, 드래그=이동, ×=삭제
- **GridLines** (893-1116): SVG로 margin frame, column/row, baseline, custom handle 렌더
- **Stepper / SliderField** (1118-1200): 재사용 input 프리미티브
- **RatioReadout** (1206-1277): 계산된 컬럼 너비, 황금비/ISO 비율 플래그 표시

**상태 관리**: Redux/Zustand 없음. `useState` + Supabase 클라이언트 직접 호출. Mutation 후 `.select()`로 fresh 데이터 받음.

---

## 5. 데이터 액세스 패턴

**ORM 없음**. `@supabase/supabase-js`로 PostgREST 직접 호출.

```ts
// 클라이언트에서 바로 mutation
await supabase.from("ref_grids")
  .insert({ ref_id, grid_type, cols, ..., source_grid_id, created_by })
  .select().single()
```

서버 fetch는 `lib/queries.ts`에 모음:

- `fetchRefGrids(refId)` — `image_path`별 그룹
- `fetchProjectGrids(projectId)`
- `fetchGridGallery()` — originals + 자손 카운트(refs/projects 합산)

---

## 6. 인증 / 멀티유저

- **로그인 없음**. 프록시 레이어(`proxy.ts`)에서 단일 비밀번호로 게이트
- 3인 고정 로스터(`lib/profiles.ts`): "하진"/"미주"/"혁" — localStorage에 profile key 저장
- 모든 row의 `created_by`에 profile key 박힘 (어트리뷰션용, 권한 게이팅 X)
- Supabase RLS는 "anon all" — 보안은 프록시가 담당

---

## 7. 외부 서비스

- **Supabase**: Postgres(+pgvector) + Storage(public bucket). 끝.
- **Jina CLIP** (`/api/embed-ref`): 그리드와 무관, 비주얼 유사도 검색용 임베딩
- **Tesseract.js**: 클라이언트 OCR, 그리드와 무관
- **그리드 자체에는 LLM/외부 호출 없음** — 100% 결정론적

---

## 8. 기술 스택

```
Next.js 16.2.4 (App Router, ⚠️ non-standard breaking changes)
React 19.2.4
Tailwind CSS 4 + Radix UI + lucide-react
Supabase (DB + Storage + ssr)
ORM 없음 (직접 PostgREST)
React Hook Form + Zod (다른 곳에선 쓰지만 GridAnalyzer는 useState)
```

> ⚠️ `AGENTS.md` 지시: **이 Next.js는 트레이닝 데이터와 다름**. 코드 짜기 전 `node_modules/next/dist/docs/` 읽으라고 명시됨.

---

## 9. 새 서비스에 그대로 옮길만한 패턴

1. **Fraction(0–1) 좌표 저장** — 미디어 변경에 강건, 다른 비율 적용 자유로움
2. **두 테이블 + nullable `source_x_id`로 계보** — original/copy를 같은 스키마에서 표현, gallery는 `WHERE source_x_id IS NULL`로 필터
3. **`?from_x=<id>` 쿼리 파라미터로 cross-context prefill** — dialog로 타겟 고르고 navigate, 타겟 페이지가 prefill 처리 → 모달 안에서 모든 걸 처리하지 않아도 되는 단순한 UX
4. **장르/조건부 lazy-load** — 모든 ref에 에디터 띄우지 않고 적용 가능한 곳만
5. **클라이언트 직접 mutation** — 작은 팀/저신뢰 임계 도메인에서 백엔드 액션 레이어 생략, `.select()`로 동기화
6. **분리된 child 테이블에 source 메타 스냅샷** (`project_grids`의 `source_image_path`, `source_width/height`) — 부모가 변해도 자식 미리보기 유지

---

## 10. 옮길 때 주의

- `created_by`만 있고 `auth.uid()` 없음 → 진짜 멀티테넌트 서비스라면 RLS 다시 짜야 함
- ORM 없는 게 빠르지만 마이그레이션은 `db/schema.sql`을 수동 관리 — 팀 규모 커지면 Drizzle/Prisma로 가는 게 좋음
- GridAnalyzer 한 파일 1200줄 — 이대로 복붙하지 말고 sub-component 단위로 쪼개서 옮기기

---

## 부록: 핵심 파일 인덱스

```
app/grids/page.tsx                          갤러리 서버 엔트리
app/grids/GridGalleryClient.tsx             갤러리 클라이언트 (filter/sort/delete)
app/ref/[id]/page.tsx                       ref 디테일, GridAnalyzer 조건부 마운트
app/wip/[id]/page.tsx                       프로젝트 디테일
app/api/embed-ref/route.ts                  (참고) 임베딩 엔드포인트, 그리드 무관

components/detail/GridAnalyzer.tsx          ★ 그리드 에디터 본체 (1200+ 줄)
components/detail/ApplyGridDialog.tsx       Apply 검색/내비게이션 모달
components/wip/ProjectGrids.tsx             프로젝트용 읽기 전용 미리보기

lib/types.ts                                GridSpec / RefGrid / ProjectGrid 타입
lib/queries.ts                              fetchRefGrids / fetchProjectGrids / fetchGridGallery
lib/supabase/{client,server}.ts             Supabase 클라이언트
lib/profiles.ts                             고정 3인 프로필 정의

db/schema.sql                               ref_grids / project_grids DDL
```
