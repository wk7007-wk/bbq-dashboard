# Excel 365 ↔ 공장 SOT 양방향 동기화 설계 v2

- authored: 2026-09-20 03:40 KST
- designer: Astra · 근무표
- scope: Excel 365 ↔ factory SOT only (CLI는 같은 SOT 쓰기 클라이언트)
- bans: Luna, VBA macros

## 1. 목표
공장이 단일 SOT. Excel 365·CLI 어느 쪽에서든 고치면 **완전 자동**으로 상대에 반영. 사람 승인 단계 없음.

## 2. SOT
| 방향 | HTTP | path |
|------|------|------|
| 할인 읽기 | GET | `/schedule_promos.json` |
| 근무 읽기 | GET | `/workschedule.json` |
| 규칙 읽기 | GET | `/workschedule_rules.json` |
| 쓰기 | PUT | `/schedule_update` (Bearer + If-Match 또는 revision) |
| 매핑 | GET/PUT | `/schedule_excel_map.json` |
| 변경 로그 | GET/append | `/schedule_sync_log.json` |

WAN GET: `http://125.176.112.214:2421`  
쓰기는 factory localhost + token.

## 3. 쓰기 클라이언트 (동등)
1. **Excel 365** — Power Query(읽기) + Office Script(쓰기, VBA 금지)
2. **CLI** — 같은 `PUT /schedule_update` (로컬 token)
어느 쪽이든 SOT에 쓰면 다른 쪽은 SOT를 구독해 따라감.

## 4. 완전 자동 동기화
### 4.1 서버 → Excel
- Office Script / 자동 새로고침: **30–60초** 폴링 GET (ETag/revision 변경 시에만 시트 갱신)
- 가능하면 공장 웹훅/`Last-Modified` 푸시로 폴링 단축

### 4.2 Excel → 서버
- 셀 변경 시 Office Script 자동 실행(또는 짧은 디바운스 후) → 즉시 `PUT /schedule_update`
- 성공 시 `_Meta`에 etag·`updated_at` 기록

### 4.3 CLI → 서버 → Excel
- CLI가 SOT PUT → Excel 폴링/웹훅이 감지 → 시트 자동 갱신

### 4.4 Excel → 서버 → CLI
- Excel PUT → CLI watch(`etag`/`updated_at` 폴링 30–60초 또는 이벤트) → 로컬 뷰/캐시 갱신

저장은 항상 자동. 수동 “동기화” 버튼은 선택(강제 즉시 1회).

## 5. `schedule_update/v1`
```json
{
  "schema": "schedule_update/v1",
  "base_etag": "W/\"…\"",
  "updated_at": "2026-09-20T03:40:00+09:00",
  "actor": "excel|cli",
  "ops": [
    {"op":"promos.upsert","date":"YYYY-MM-DD","items":[{"platform":"배민","discount":3000}]},
    {"op":"shift.upsert","date":"YYYY-MM-DD","emp_id":"emp_…","start":"17:00","end":"24:00"},
    {"op":"shift.clear","date":"YYYY-MM-DD","emp_id":"emp_…"}
  ]
}
```

## 6. 충돌
- **최신 `updated_at`(타임스탬프) 우선**. 동일 ms면 `actor` tie-break: `cli` > `excel` (고정 규칙).
- If-Match 실패(412)여도 클라이언트가 최신 GET 후 **필드 단위 LWW**로 재PUT (승인 대기 없음).
- 모든 충돌·덮어쓰기는 `/schedule_sync_log.json`에 append.

## 7. 스키마 드리프트 = 완전 자동 리매핑
1. 감지: SOT schema(+키셋) 해시 ≠ `map.schema_hash`
2. **즉시** 휴리스틱 매핑 적용(이름 유사·타입·위치) → `schedule_excel_map.json` PUT
3. Excel PQ rename / Script 컬럼 맵 핫리로드
4. 제안·승인 단계 **없음**. 적용 내용을 sync_log에만 남김.

## 8. Excel 시트
Promos / Shifts / Employees / `_Meta`(etag, schema_hash, last_sync, map_version, updated_at)

## 9. 구현 순서
1. `schedule_update` + etag/revision + sync_log (현재 update 404)
2. 초기 `schedule_excel_map.json` + 자동 리맵퍼
3. Excel: PQ + 변경감지 Office Script + 30–60s pull
4. CLI: 동일 PUT API + watch
5. 스모크: Excel↔SOT↔CLI 왕복, LWW, 드리프트 자동맵

## 10. 산출물
- `/updates/excel365_factory_sync_design_v2.html` (+ md)
- `/schedule_excel_map.json`
