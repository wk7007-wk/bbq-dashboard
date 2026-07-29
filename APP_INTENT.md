# APP_INTENT.md

## 프로젝트 목적
- `bbq-dashboard`는 정적 웹(site/static-web) 운영 현황판 저장소다.
- 운영 상태를 Firebase/라이브 데이터 기반으로 읽어 보여주며, 문서/구조 정합성만 책임진다.

## 범위
- 정적 HTML 및 문서 정렬/명세 정비.
- `/updates`는 AppUpdateCenter catalog/version/history metadata의 정적 원천이다. 사용자 설치 링크는 Release `.apk`, 내부 updater의 `version.json`은 동일 SHA의 `.bin` asset을 유지한다.
- 퇴역 NotallyX·legacy StoreBot은 catalog에서 제외하고, 최신 검증 asset이 없는 앱은 과거 APK로 대체하지 않는다.
- Firebase 읽기 경로는 `read-only` 기준으로만 다루며, write 동작은 이 저장소 범위에서 구현하지 않는다.
- Android WebView 대시보드(별도 런타임)는 본 저장소 범위 밖으로 구분한다.
- PosDelay 배달료 표시는 설정된 high/base 값을 실제 적용값처럼 추정하지 않고, Android가 GET readback으로 확인한 `lastAppliedFee`만 금액으로 보여준다. 확인 전/null은 `확인 중`, 사용자가 입력한 `0원`은 fallback 값으로 바꾸지 않는다.

## MCP 정렬 기준 (site/static-web)
- Firebase MCP: `read-only` 데이터 경계 점검.
- Playwright: desktop/mobile 화면 캡처 보유.
- Axe: 접근성 스캔 결과 보유.

## 완료 기준
- 경계와 용도를 문서에서 분명히 구분(사이트 정적판 vs Android WebView).
- 변경한 정적 화면과 문서 포인터의 정합성이 맞아야 한다.
- `git diff --check` 통과 및 문서 외 수정 없음.
- PosDelay 동작 변경 시 `tests/posdelay_fee_ui_test.js`로 확인값/null/0원 전달 회귀를 검증한다.
- update metadata의 SHA/size/package/certificate가 `app-updates` release asset과 일치하고 draft PR 검토 전에는 Pages live로 간주하지 않는다.
