# Excel 365 ↔ 공장 SOT 양방향 동기화 설계 v3

- designer: Astra · 근무표
- scope: Excel 365(OneDrive) ↔ 공장 SOT only. CLI는 동일 SOT 쓰기 클라이언트
- bans: Luna, VBA/COM/매크로

## 목표
공장 서버가 단일 SOT. Excel은 매크로 없는 매개체. Excel·CLI 수정 → SOT, SOT 변경 → Excel 자동. 사람 승인 없음.

## 엔드포인트 / 인증
- GET `/schedule_promos.json` (WAN 무토큰)
- GET `/workschedule.json`
- PUT `/schedule_update` — Bearer + If-Match (localhost + token)
- GET/PUT `/schedule_excel_map.json`
- append `/schedule_sync_log.json`

## 충돌
서버 SOT 우선. 412 시 클라 변경 폐기·재GET. sync_log 기록. LWW 폐기.

## 자동 리맵
schema_hash 불일치 → 휴리스틱 즉시 적용 → map PUT → PQ/Script 핫리로드. 승인 없음.

## Excel
- 서버→Excel: Power Query 자동 새로고침
- Excel→서버: Office Script PushToFactory (또는 웹요청 버튼)
