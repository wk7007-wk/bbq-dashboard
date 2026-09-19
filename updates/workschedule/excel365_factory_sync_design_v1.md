# Excel 365 ↔ 공장 SOT 양방향 동기화 설계 v1

- authored: 2026-09-20 03:37 KST
- designer: Astra · 근무표 도메인 초안
- scope: Excel 365 ↔ factory server only
- bans: Luna, macros (VBA)

## 1. 목표
사람이 Excel 365에서 근무·할인 칸을 보고 고친다. 공장이 SOT다. Excel은 매크로 없는 매개체다.

## 2. SOT 엔드포인트
| 방향 | method | path | 비고 |
|------|--------|------|------|
| 읽기(할인) | GET | `/schedule_promos.json` | schema `schedule_promos/v1`, `by_date[YYYY-MM-DD][]` |
| 읽기(근무) | GET | `/workschedule.json` | schema `workschedule_live_v1`, write_ready |
| 읽기(규칙) | GET | `/workschedule_rules.json` | 요일 고정 규칙 |
| 쓰기 | PUT | `/schedule_update` | Bearer + If-Match, 원자 패치 |
| 매핑 | GET/PUT | `/schedule_excel_map.json` | 시트↔JSON 컬럼 map + schema_hash |

Base(WAN GET): `http://125.176.112.214:2421`  
쓰기: factory localhost `:2421` + write token (WAN PUT 금지).

## 3. Excel 365 구조 (매크로 없음)
### 3.1 시트
- `Promos` — 일자×플랫폼 할인 (표시·편집)
- `Shifts` — 일자×직원 예외/휴무 (표시·편집)
- `Employees` — 직원 마스터 (읽기 위주)
- `_Meta` — ETag, schema_hash, last_sync, map_version (숨김 권장)

### 3.2 읽기 = Power Query
- 데이터 → 데이터 가져오기 → 웹 → `.../schedule_promos.json` / `.../workschedule.json`
- JSON→표 전개 후 `map.json`의 `pq_columns`로 한글 헤더 rename
- 새로 고침: 수동 또는 주기(Excel 365 쿼리 속성)

### 3.3 쓰기 = Office Script (TypeScript, VBA 금지)
- 리본/자동: `SyncToFactory`
1. `_Meta!ETag` 읽기
2. `Promos`/`Shifts` dirty 행만 수집
3. `map.json`으로 JSON 패치 빌드
4. `PUT /schedule_update`  
   - `Authorization: Bearer <token>` (Excel Script 파라미터/워크북 비밀, 채팅·파일 하드코딩 금지)  
   - `If-Match: <ETag>`  
   - body: `{"schema":"schedule_update/v1","base_etag":"...","ops":[...]}`
5. 200 → 새 ETag·schema_hash를 `_Meta`에 기록, dirty 클리어
6. 412 Precondition Failed → 충돌: PQ 새로고침 후 재편집 안내
7. 401/403 → 토큰/권한 막힘 보고

## 4. `schedule_update` 제안 스키마
```json
{
  "schema": "schedule_update/v1",
  "base_etag": "W/\"abc\"",
  "ops": [
    {"op":"promos.upsert","date":"2026-09-21","items":[{"platform":"배민","discount":3000}]},
    {"op":"shift.upsert","date":"2026-09-21","emp_id":"emp_yeonok","start":"17:00","end":"24:00"},
    {"op":"shift.clear","date":"2026-09-22","emp_id":"emp_jaehoon"}
  ]
}
```
서버: If-Match 검증 → ops 적용 → 새 ETag 반환. `schedule_promos`/`workschedule` 파생 갱신.

## 5. `schedule_excel_map.json` + 스키마 드리프트
```json
{
  "schema": "schedule_excel_map/v1",
  "map_version": 1,
  "schema_hash": "sha256:…",
  "hash_inputs": ["schedule_promos/v1","workschedule_live_v1","schedule_update/v1"],
  "sheets": {
    "Promos": {"date":"A","platform":"B","discount":"C","max":"D","always":"E"},
    "Shifts": {"date":"A","emp_id":"B","emp_name":"C","action":"D","start":"E","end":"F"}
  },
  "pq_columns": {"platform":"플랫폼","discount":"할인액"},
  "pending_remap": null
}
```

### 반자동 리매핑 흐름
1. **감지**: 에이전트/스크립트가 SOT schema(+샘플 키셋) 해시 계산 ≠ `map.schema_hash`
2. **제안**: diff(추가·삭제·이름변경 컬럼)를 updates HTML + `pending_remap`에 기록. 채팅은 한 줄+링크
3. **승인**: 컨트롤러가 승인 값 회신
4. **갱신**: 승인 후 `map.json` PUT, Office Script/PQ rename 가이드 갱신, `schema_hash` 교체
5. 승인 전 쓰기는 거부(또는 구 map으로만 읽기)

## 6. 충돌·안전
- 낙관적 잠금: ETag / If-Match only
- WAN은 GET only. 쓰기는 factory 로컬 PUT
- 토큰은 Office Script 환경·1Password. git/chat에 넣지 않음
- 본 설계는 Excel365↔공장만 (다른 파이프와 분리)

## 7. 구현 순서
1. 공장에 `schedule_update` 라우트 + ETag (현재 404)
2. `schedule_excel_map.json` 초기 map PUT
3. Excel 워크북: PQ 연결 + Office Script `SyncToFactory`
4. 근무표 에이전트: 해시 감시 루틴 → 제안 카드 → 승인 시 map 갱신
5. 스모크: GET→편집→PUT→GET 왕복, 412 충돌 테스트

## 8. 산출물 경로 (저장 목표)
- 설계 HTML: `/updates/excel365_factory_sync_design_v1.html`
- 설계 MD: `/updates/excel365_factory_sync_design_v1.md` 또는 `md/`
- map 초안: `/schedule_excel_map.json`

WAN 열람: `http://125.176.112.214:2421/updates/excel365_factory_sync_design_v1.html`
