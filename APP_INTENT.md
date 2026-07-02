# APP_INTENT.md

## 프로젝트 목적
- `bbq-dashboard`는 정적 웹(site/static-web) 운영 현황판 저장소다.
- 운영 상태를 Firebase/라이브 데이터 기반으로 읽어 보여주며, 문서/구조 정합성만 책임진다.

## 범위
- 정적 HTML 및 문서 정렬/명세 정비.
- Firebase 읽기 경로는 `read-only` 기준으로만 다루며, write 동작은 이 저장소 범위에서 구현하지 않는다.
- Android WebView 대시보드(별도 런타임)는 본 저장소 범위 밖으로 구분한다.

## MCP 정렬 기준 (site/static-web)
- Firebase MCP: `read-only` 데이터 경계 점검.
- Playwright: desktop/mobile 화면 캡처 보유.
- Axe: 접근성 스캔 결과 보유.

## 완료 기준
- 경계와 용도를 문서에서 분명히 구분(사이트 정적판 vs Android WebView).
- 문서 파일 정합성 정렬 완료(문서-only 변경).
- `git diff --check` 통과 및 문서 외 수정 없음.
