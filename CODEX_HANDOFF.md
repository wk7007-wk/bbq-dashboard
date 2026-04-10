# PosDelay 대시보드 UI 검토 요청 (Codex 인수인계)

## 작업 내용
`posdelay.html` 대시보드 레이아웃 대규모 재구성 완료. UI/UX 검토 및 디자인 개선 필요.

## 변경 전 백업
- `posdelay.html.bak` = 변경 전 원본

## 변경된 카드 순서 (Before → After)

### Before
1. 모니터링 (처리중 + K가동)
2. 조리모드
3. 배민 광고 (스케줄 포함)
4. 쿠팡 광고
5. 즉시할인
6. 배민 지연
7. 쿠팡 지연
8. 배달료
9. 영업정지
10. 배달료 모니터링 (프린터)
11. 주문 리스트
12. 자동화 엔진
13. 방어 상태
14. 진단
15. 권한

### After
1. **모니터링** — 처리중 + 프린터 건수(통합) + groupSummary + 엔진 요약(인라인)
2. **조리모드** — 변경 없음
3. **배민 광고** — 스케줄 섹션 제거됨
4. **쿠팡 광고** — 변경 없음
5. **광고 스케줄** (NEW) — 배민+쿠팡 공통 스케줄 분리
6. **즉시할인** — 변경 없음
7. **배달료** — feeMonitorCard + feeOrderListCard 통합 (프린터 모니터링 + 주문 리스트)
8. **영업정지** — 변경 없음
9. **배민 지연** — 하단으로 이동 (미구현 기능)
10. **쿠팡 지연** — 하단으로 이동 (미구현 기능)
11. **진단** — "활동" 탭 추가 (KDS/광고 상태)
12. **권한** — 앱에서만 표시

### 삭제/숨김
- **K가동 버튼** — HTML 삭제
- **방어 상태 카드** — display:none (JS 함수 참조용 DOM 유지)
- **자동화 엔진 카드** — display:none (monitorCard에 인라인 요약)
- **feeMonitorCard / feeOrderListCard** — DOM 삭제 (gatePanel에 통합)

## 주요 변경 상세

### 1. 모니터링 카드 (monitorCard)
- 처리중 건수 옆에 프린터 유효건수 표시 (`printerCount`, `printerDot2`)
- K가동 버튼 제거
- 하단에 엔진 요약 인라인 (`engineSummaryInline`, `subDot2`, `subStatus2`, `engineBadge2`)

### 2. 스케줄 분리 (scheduleCard)
- 배민 광고 내부에 있던 스케줄을 독립 카드로 분리
- `AdScheduler.isWithinActiveWindow()`는 배민+쿠팡 모두 호출하는 공통 로직
- 새 element: `tog_schedule_enabled3`, `schDot3`, `schOnDisp2`, `schOffDisp2`
- 기본 접힘 상태

### 3. 배달료 통합 (gatePanel)
- 프린터 연결 상태/유효건수/게이지바 → gate_body 상단에 통합
- 주문 리스트 (주소 포함) → gate_body에 통합
- **음영 주문(expired) 숨김**: `if(o.expired) return;` 추가

### 4. 진단 활동 탭
- 기존 KDS/PosDelay/Dump 탭에 "활동" 탭 추가
- KDS 현황 + 광고 상태 + 쿨다운 정보 표시

### 5. 디자인 압축
- 카드 padding: 12px → 10px
- 카드 margin-bottom: 8px → 6px
- 카드 제목 font-size: 13px → 12px

## Codex 검토+최적화 요청사항

### UI/UX 검토
1. **디자인 일관성** — 새 카드(scheduleCard)와 기존 카드 스타일 통일
2. **스크롤 길이** — 더 압축 가능한 부분 있는지
3. **터치 타겟** — 모바일(S10+)에서 44px 미만인 터치 영역
4. **색상 대비** — 다크 배경에서 가독성
5. **groupSummary 레이아웃** — 7개 항목이 세로로 나열되는데 더 컴팩트하게 가능한지
6. **접힘/펼침 UX** — 기본 접힘 섹션들의 사용성

### 코드 최적화 (미완료 — 직접 진행 필요)
7. **중복 인라인 스타일 → CSS 클래스화** — `style="font-size:11px;color:var(--text-secondary)"` 같은 패턴이 수십 번 반복됨. `.txt-sm`, `.txt-muted` 등 유틸 클래스로 추출
8. **dead code 제거** — display:none 카드(engineCard, defenseStatusCard) 중 JS에서 참조 안 하는 DOM 완전 삭제 가능한지 확인 후 제거
9. **JS 중복 함수 정리** — `onCaptureStatusUpdate`와 `onGateStatusUpdate` 내부의 주문 리스트 렌더링 로직이 거의 동일 → 공통 함수로 추출
10. **togSource 함수** — K가동 삭제로 더 이상 호출되지 않음. 제거 가능
11. **MODE_CARDS / switchMode** — 하단 탭바가 display:none이고 항상 'all' 모드. 탭바 HTML + switchMode 관련 코드 정리 가능
12. **파일 크기** — 현재 2264줄. 목표: 2000줄 이하 (불필요 코드 제거로)

## 기술 구조
- WebView 대시보드 (GitHub Pages)
- NativeBridge로 Android 앱과 양방향 통신
- SSE + 폴링으로 Firebase 실시간 데이터
- 외부 호출 함수 (시그니처 변경 금지):
  - `onGateStatusUpdate(json)`
  - `onCaptureStatusUpdate(json)`
  - `renderEngineTasks(json)`
  - `updateSubphoneStatus(json)`
  - `_onForeground()`
