# ChickenTimer APP_INTENT.md

## 만든 이유
- 치킨 조리 타이머를 매장 화면, 서브노트북, Android WebView에서 안정적으로 공유해 조리 누락을 막는다.

## 사용자 결과
- 7/10/13분 상태, 종료 순서, 만료 경고, 알림음, 이동/스위치 효과음이 멀리서도 즉시 구분되어야 한다.
- 버튼은 `삭제/추가/보정/일시정지/재개/프리셋` 동작별 짧은 버튼음과 해당 TTS를 사용하고, 종료음은 실제 만료로 새 완료 기록이 생길 때만 재생한다. 삭제가 종료음으로 들리면 안 된다.
- 빈 보드나 동기화 지연이 조리 누락으로 이어지면 안 된다.

## 절대 기준
- 빈 보드 동기화 사고, 알림 누락, 종료 상태 색상 약화는 치명 회귀다.
- 원거리 판별은 `색상 + 크기/면적/두께`가 먼저이고 숫자·문구는 정확한 시간과 상태를 확인하는 보조 수단이다. 색만으로 끝내지 않고 물높이와 카드 전체 둘레를 함께 써야 하며 숫자 가독성도 보호한다.
- Android WebView 래퍼는 웹 원본 의도를 따라야 한다.
- 자동 `tick/expired`가 현재 원격 보드의 진행 중 타이머를 지우는 것은 치명 회귀다. 낡은 화면이 전체 보드를 덮어쓰지 못하게 클라이언트와 RTDB rules 양쪽에서 막는다.
- `복구`는 타이머를 1분으로 맞추는 버튼이 아니다. 약 1분 전 스냅샷의 `endAt` 기준 남은 시간을 현재 시각으로 재기준화해 되살리는 비상 복구다.

## UI/동선 기준
- 첫 화면은 실제 타이머 보드여야 한다.
- 숫자 터치 즉시 시작, 삭제/추가/분할 동작은 반복 조리 중 헷갈리지 않아야 한다.
- 최우선은 카운트다운 숫자와 주요 6칸의 usable area 최대화다. 실행 중 좌우 조작 레일 폭은 고정하고 남은 면적은 숫자가 쓴다. `복구/레시피/동기화`는 별도 줄을 만들거나 숫자·카드를 덮거나 줄여서는 안 되며, 여유가 있을 때만 바깥의 좁은 정적 rail을 쓴다.
- 모든 실제 타이머 state/profile(세로·tall 카드와 OV split main/aux 포함)에서 `삭제/추가/+10/+60/-10/-60`은 카운트다운 block height를 줄이는 가로 행이 아니라 counter geometry 밖의 bounded side/perimeter rail을 쓴다. overlap/clipping 없이 accessible hit target을 보존하고 countdown은 카드의 남은 최대 영역을 쓰며, 구조 배분은 device viewport 고정값이 아닌 panel/container ratio를 따른다.
- 실행 중인 메인 카운트다운 영역은 터치 한 번으로 즉시 일시중지/재개되어야 하며, 카드 드래그와 충돌하면 안 된다.
- 레시피는 타이머 조작 배열을 바꾸지 않는 보조 화면이며, 명시적 `뒤로`로 닫는다. 기본은 출력 우선이고 목록은 이름순 자동정렬이며, 기존 DB와 사용자가 입력 중인 현재 input을 보존한다. 이 요구는 전용 recipe contract로 검증하며 timer-layout contract에 섞지 않는다.
- 근무스케줄 공식 주소는 `OrderHelper/`와 일관성 있는 `https://wk7007-wk.github.io/WorkSchedule/`가 기준이다. 타이머 앱에는 합치지 않고, 구주소 `chicken-timer/dashboard.html`은 공식 주소로 쓰지 않는다.
- 타이머 웹 기준 주소는 `https://wk7007-ops-static-2026.web.app/chicken-timer/`, 서브노트북 고정 진입 주소는 `https://wk7007-ops-static-2026.web.app/chicken-timer/?profile=subnote`다. GitHub Pages `/updates/chicken-timer/`는 APK 업데이트 메타데이터 화면이지 타이머 보드 주소가 아니다.
- `profile=subnote`는 화면 밀도만 고정하며 동기화 room은 기본 주소와 같은 `main`이다. 호스트가 바뀌면 브라우저 localStorage origin도 바뀌므로 기존 PIN 인증값은 자동 승계되지 않고 새 주소에서 최초 1회 인증이 필요하지만, 원격 타이머 상태를 별도 room으로 분기하지 않는다.
- 서브노트북 프로필은 같은 보드를 다른 밀도로 보여줄 뿐 같은 `main` room을 공유한다. 1024×600과 1366×768에서 진행 카운터의 숫자/그림자 overflow를 숨기지 않고 화면 안에 표시해야 한다.
- 6칸은 `튀김3`×3, `튀김2`×2, `OV`×1의 물리 순서다. 세로폰은 이를 6행 1열로 두고 세로 스크롤을 기본 동선으로 만들지 않는다.
- `OV`는 하나의 primary card이고 utility는 그 카드 바깥의 좁은 정적 rail이다. 일반 가로 화면의 OV/rail 분리와 가로 OV 숫자판 5열×2행 기준은 유지한다.
- 노트북 portrait는 명시적으로 같은 폭의 가로 1행×6열이며 2×3이나 세로 1×6이 아니다. 각 카드 안의 minute preset은 readable label을 카드 안에 보존한 2열×6행이고 4열×3행 압축은 금지한다. `+10/+60` positive와 `삭제/추가/-10/-60` primary/decrease perimeter group은 서로 겹치지 않는 별도 rail segment를 쓴다. 노트북 landscape의 가로 배치는 기존 기준을 유지하는 것이며 이 portrait 정정에서 추론한 새 요구가 아니다.
- 반응형의 구조적 카드·track·gap 배분은 ratio/track 기반이며 device-specific 고정 layout size를 쓰지 않는다. 접근성 touch/icon 최소 token은 layout share를 바꾸지 않는 범위에서 clamp 또는 고정 design token을 쓸 수 있다. 목표 모델의 브라우저 geometry와 물리 screenshot/사용자 시각 수용을 모두 확인해야 한다.
- 현재 geometry 작업의 원래 목표는 기능·색상·상태를 완전본으로 복구한 뒤 실행 중 카운트다운과 대기 상태 숫자판·버튼의 상대 배율, 배열, 크기만 맞추는 것이다. 현행 V22의 카운트다운 font 값이나 축소된 기능·색상은 목표값 또는 accepted baseline으로 간주하지 않는다. action set, DOM/handler/ARIA, 색상 역할·강도, 물높이·대기/실행/정지/분할/완료 기능을 freeze하고 변경 범위는 CSS track/order/gap/size에만 둔다. 범위 밖 변경이나 터치 타깃 축소가 관찰되면 비지오메트리 변경을 제거해 마지막 기능 완전본으로 rollback한다.
- Note9 852×393 unsplit running 기준 6개 조작은 `▼10|▲10 / ▼▼60|▲▲60 / 삭제|추가`의 2열×3행 배열이며, 모든 셀은 동일 크기·중앙 hit 영역과 최소 44 CSS px touch target을 가져야 한다. 과거 36 CSS px 판정은 사용자 실사용에서 삭제·추가 터치 불가로 확인됐으므로 PASS 근거로 재사용하지 않는다. TabA와 `subnotebook`의 기본 touch token 44px도 유지한다.
- 실기계 시각 검증은 브라우저·가상 viewport screenshot으로 대체하지 않는다. Android 래퍼는 카메라 권한 없이 자기 앱의 현재 보이는 Window만 foreground+focus gate에서 PixelCopy(API 26+) 또는 WebView Canvas fallback(API 21-25)으로 PNG 캡처할 수 있다. 백그라운드 요청은 촬영하지 않고 대기하며 다음 전면 표시 때 nonce·revision·expiry 기준 정확히 1회 소비한다. PNG·viewport/density·앱/기기 identity hash·asset/runtime receipt·SHA를 묶고 인증된 고정 endpoint의 acknowledgement 뒤에만 수집 완료로 본다. endpoint·exact physical identity가 없으면 app-private evidence를 보존하고 `upload_pending`으로 실패 닫힘하며, 캡처가 기능/배열/색상이나 타이머 상태를 변경해서는 안 된다.
- 세로 1열 시작 숫자판은 넓은 버튼 면적을 작은 글씨로 낭비하지 않는다. 노트북 세로 화면에서는 프리셋 숫자가 원거리에서도 식별될 만큼 카드 면적에 따라 커지고, 휴대폰에서는 12개 값이 잘리지 않는 범위에서 축소되어야 한다.
- 화면은 모델명이 아니라 기록된 CSS viewport의 short/long side 기준으로 Samsung Galaxy Note9 393×852, Samsung Galaxy Tab A 8.0 (2019) 800×1280, 서브 노트북 1085×1885를 자동 인식하고 그 밖은 proportional fallback을 쓴다. 서브 노트북 전용 프로필은 색상/면적과 큰 프리셋 숫자를 우선하고 텍스트 로그는 보조로 둔다.
- 가로 진행 화면은 큰 카운터를 `분`과 `초` 두 줄로 나누고, 초는 작은 크기와 무채색 구분선으로 구별한다. 조절 버튼은 숫자 위아래에 둔다.
- 정보 공간은 전역 상단 띠가 아니라 각 카드 내부에 둔다. 화면에는 메인·보조 타이머의 최근 동작 2건을 `7분 시작`, `7분 정지`, `+60초 추가`, `보조 7분 시작`, `13분 · 5분 전 완료`처럼 한 줄에 한 건씩 보여준다. 가장 최근은 선명하게, 두 번째는 흐리게 표시하고 현재/순위 행과 누적 횟수 문구는 노출하지 않는다. DOM/접근성·복구 기준의 최근 4건은 유지하되 숨겨진 두 행 때문에 빈 공간을 예약하지 않고 카운터·조작 영역이 해상도 안의 남은 공간을 사용한다. `몇 분 전 완료`는 서버 기준 현재 시각으로 갱신한다.
- 완료 횟수·최근 완료·원본 활동 로그는 현재 타이머를 시작/삭제/이동하거나 복구·원격 동기화해도 줄어들지 않는다. UI에는 최근 동작 2개를 투영하고 DOM/히스토리 투영은 4개를 유지하되 안전·복구용 원본 로그는 슬롯별 최대 40개 보존한다.
- 튀김3/튀김2/오븐의 물리 배열과 슬롯 순서는 운영 기준이므로 임의로 바꾸지 않는다.
- 구역은 큰 외곽 테두리로 묶고, 각 타이머 칸은 그 안의 작은 테두리 한 칸으로 보여야 한다.
- Note9에서는 작은 칸 경계 표현이 약하면 조작 단위가 헷갈린다. 구역 안 슬롯 사이와 숫자 버튼 사이에 어두운 홈/2px 테두리/안쪽 그림자로 칸 단위를 분명히 보여야 한다.
- 튀김3은 멀리서 봐도 하나의 구역으로 느껴질 만큼 외곽 묶음이 강해야 한다.
- 빈공간은 장식이 아니라 숫자/버튼 글씨 크기를 키우는 데 써야 한다. 구역 표식과 패딩은 필요한 최소 크기로 유지한다.
- Note9 가로 화면은 구역 이름 레일을 없애고 그 폭을 숫자와 버튼에 돌린다. 구역 판단은 굵은 외곽 테두리와 구역색으로만 일관되게 처리한다.
- Note9 카운트 중 화면에서 숫자 readout이 깜빡이거나 빈 패널로 보이면 조리 누락 위험이다. 숫자 재측정은 화면 크기/표시값 변화 때만 최소화한다.
- 색상 역할은 섞지 않는다. 노랑/파랑/초록은 구역 외곽과 버튼 경계, 청록은 남은 시간 면적, 주황/빨강은 임박 카드 전체 둘레, 7/10/13 색은 보호판 위 숫자 확인에만 쓴다. 청록과 임박색 사이에는 검정 분리선을 두어 어느 구역색 위에서도 같은 순서로 읽히게 한다.
- 튀김 슬롯의 눈에 보이는 큰 슬롯/테두리/패널 색상은 물리 번호 기준으로 `1,2,3` 노랑 계열, `4,5` 파랑 계열이어야 한다. 오븐 `OV`는 초록 구분을 유지한다.
- 글씨가 어떤 상태에서도 묻히면 치명 회귀다. WCAG 최소 대비보다 보수적으로 Note9 숫자 글씨는 어두운 패널 위 7:1 이상 대비를 목표로 한다.
- 튀김 슬롯은 물리 위치 `1~5`, 오븐은 `OV` 배지를 왼쪽 위에 고정한다.
- 완료 후에도 숫자 시작 그리드는 유지한다. 중복되는 `6 완료` 같은 별도 완료 배지는 노출하지 않고, 물리 칸 번호·카드·숫자판의 빨강/흰색 고대비 점멸과 카드 내부 `6분 · 방금 완료` 로그로 0초 행동 시점을 알린다. 완료 점멸 때 물리 번호 배지가 커져 로그를 가리지 않는다.
- 시간 조절 버튼은 `-60/-10/+10/+60` 초 단위 표기를 그대로 보여주고, 누적 보정값은 원래 시간과 분리한다.
- `삭제/추가/-10/-60`과 `+10/+60`은 각각의 bounded side/perimeter rail에서 독립 동선을 유지한다. 버튼은 고정 청록색이 아닌 반투명 dark/gray라 물이 있으면 실제 청록 면적이 비치고 0이면 원래 어두운 버튼색으로 보여야 하며, 물·임박층은 입력을 가로채지 않는다.
- 모든 시간 추가 값은 공통 `addTime(deltaMs)` 성격 경로로 처리한다. 진행 중에는 기존 `endAt`에 더하고, 정지 중에는 `remainingSeconds`만 늘리며, 빈 슬롯/완료 슬롯의 명시 시작 UX는 유지한다.
- 한 슬롯의 추가/분할 타이머는 최대 1개만 허용한다. 분할 중에는 메인과 보조 타이머가 각각 원래 시간, 남은 시간/완료, 보정/삭제 동선을 독립적으로 보여야 하며, 한쪽이 완료되면 8초 동안 완료 상태를 보인 뒤 완료된 쪽만 정리하고 남은 타이머는 단독 타이머 형태로 승격한다.
- 추가/분할 타이머는 메인과 보조를 vertical divider로 나눈 left/right panel로 두며, 위아래 구조가 아니다. 두 panel은 독립적인 `+10/+60 → 카운터/절대 게이지 → -10/-60 → 삭제` 동선을 유지하고 작은 화면에서 잘리면 안 된다.
- 남은 시간 게이지는 카드 전체를 채우는 정적 청록 그라데이션 면적이다. 5분=100%, 0분=empty, 5분 초과=상단 clamp이며 15분/7분/900초 기준은 stale이다. 최소 검정 숫자 label 배경은 물을 가리지 않아야 하며, 나머지 대비·임박·완료 기준은 유지한다.
- 정지는 빨강·구역색을 쓰지 않고 흰색/먹색 점선과 `Ⅱ 일시정지` 점멸로 경고하며, 숫자 터치 재개 전까지 모래 흐름과 남은 시간이 멈춘다. 프리셋 시작 직후 구형 WebView의 ghost 입력은 같은 칸 readout에 한해 짧게 무시하고, 이후 사용자의 명시 숫자 터치는 정상적으로 일시정지·재개해야 한다.
- 슬롯 이동은 카드 전체 영역에서 즉시 드래그로 시작하고, 드래그 중 물리 위치 번호/색상은 유지한 채 카드 내용 preview 스왑을 보여준 뒤 손을 떼면 확정한다. 확정된 드롭은 성공 pulse/ring/완료 문구와 낮은 중요도 이동 cue로 종료 알림음과 구분하고, 짧은 탭은 기존 버튼 동작을 유지하며 위치 변경 취소는 짧은 undo만 허용한다.
- 저사양 Android/WebView에서 슬롯 이동은 전체 보드 재렌더를 피하고 source/target 슬롯만 갱신해야 한다. pointermove는 frame 단위로 묶고, 이동 중 무거운 점멸/그림자/필터는 잠시 낮춰야 한다.

## 데이터/경계 기준
- `ChickenTimerBoard`가 웹 원본이고 `AttendanceBoard/docs/chicken-timer`는 호스팅 복사본이다.
- `ChickenTimerApp`은 WebView 래퍼이며 원격 로드와 오프라인 fallback을 제공한다.
- 레시피 데이터는 StoreBot과 같은 메인 경로 `/packhelper/recipes`를 사용한다. 타이머 앱에서 쓰기를 허용하는 범위는 레시피 4필드뿐이다.
- 레시피 저장은 기존 DB 보존이 우선이다. 수정 저장은 해당 row key에 PATCH만 수행하고, 기존 항목 삭제/초기화/`active:false` 마이그레이션을 자동 수행하지 않는다.
- 근무표, 출근기록, 대시보드성 정보는 타이머에서 수정하지 않고 출력 전용으로 둔다.
- RTDB 동기화 경로 변경 시 웹, 호스팅 복사본, Android asset 미러를 함께 확인한다.
- Hosting의 JS/CSS가 장기 캐시되더라도 낡은 화면이 남지 않게 `index.html`의 모든 로컬 asset query는 해당 파일 SHA-256 앞 12자리와 일치시킨다. 원본·호스팅 복사본·Android asset의 HTML과 asset hash를 같은 배포에서 대조한다.
- 기기마다 다른 벽시계로 `endAt`을 계산하지 않는다. 웹은 같은 호스팅의 `Date` 응답으로 즉시 보정하고, Android asset WebView는 `/packhelper/chicken_timer/clock/{syncKey}`에 Firebase server timestamp를 요청해 단조 시계에 고정한다. 잘못된 REST `/.info/serverTimeOffset` 경로로 되돌리지 않는다.
- 시간추가가 `start/clear` 초기화 경로를 호출해 기존 `durationSeconds/remainingSeconds/endAt/lastCompleted`를 새 타이머 값으로 덮는 것은 치명 회귀다.
- 화면 회전, 레이아웃 변경, 상단 정보/게이지 렌더링은 현재 작업 데이터를 쓰거나 리셋하면 안 되며, 기존 `복구` 버튼과 active 스냅샷 히스토리를 제거하거나 축소하지 않는다.
- 만료·알림 판정은 최대 250ms watchdog을 유지하되 DOM·숫자·물높이 같은 시각 갱신은 기본 1초 간격으로 제한해 노트북 장시간 실행 부하를 낮춘다.
- 활동 로그·완료 횟수·최근 완료는 물리 칸 `1~5/OV`의 이력이다. 타이머 내용 이동 시 이력은 물리 칸에 남고, 복구/폰-PC 원격 상태 적용 시에는 최신 완료와 로그 합집합 및 큰 완료 횟수를 보존한다.
- 리셋/복구 원인 추적은 최신 보드값만으로 부족하다. `clear/recover/reject-reset/expired` 같은 이벤트는 `/packhelper/chicken_timer/events/{syncKey}/{yyyyMMdd}` 원격 감사 로그로 남겨야 한다.
- 복구 히스토리는 진행 중인 타이머가 있는 스냅샷만 보관한다. 종료값이 바뀌는 추가/보정/분할 변경은 10초 간격과 무관하게 바로 기록해 최근 상태가 빠지지 않아야 한다.
- `lastCompleted`는 기존 `durationSeconds/completedAt`을 읽되, 새 저장은 `presetKey/baseDurationSeconds/finalDurationSeconds/adjustedDeltaSeconds/completedAtServerMs`를 분리한다.
- 동기화 상태는 서버시간 보정 기준으로 `동기화됨/보정중/오프라인`을 표시한다. 오프라인 dirty 재전송은 같은 슬롯의 최신 원격 진행 타이머를 덮지 않는다.
- 동기화의 장기 방향은 파이어 의존이 아니다. 같은 봉투·충돌 규칙 위에 가장 먼저 살아있는 길을 붙인다. 우선순위는 같은 공간 직통(와이파이/핫스팟/유선, 기억된 주소 재시도) → 인터넷 공유방(파이어) → 나중에만 블루투스 같은 근거리 예비다. Note9/Tab WebView는 `onopen`만으로 스트림을 믿지 않고 실제 put/patch가 오기 전·좀비 연결에는 화면이 보일 때만 4~12초 GET 안전망을 쓰며, 입증된 스트림과 hidden에서는 멈춘다. 안드로이드는 ui_refresh 전용 EventSource를 열지 않는다. 로컬 직통은 원격 보드를 쓰지 않는다. Grok 원격 새로고침(`/packhelper/chicken_timer/ui_refresh/{syncKey}`)은 보드를 쓰지 않고 로컬 복구 스냅샷을 남긴 뒤 화면만 다시 연다.
- 서버시간 확인 실패가 사용자 터치를 버리면 안 된다. 기존 로컬 시각으로 `endAt`을 확정하고 `오프라인 · 동기화 대기`를 표시하며, dirty 쓰기는 유한 backoff 후 재연결 때 기존 revision/슬롯 충돌 gate를 거쳐 보낸다.

## C&I / AI Ops 경계
- C&I는 빈 보드 동기화, reset/recover 이벤트 이상, 호스팅 복사본 불일치, Playwright/Node smoke 실패, 배포 누락을 self_fix 후보로 올린다.
- 자동 복구는 웹 원본/호스팅 복사본/Android asset 미러 보정, 테스트, Firebase Hosting 배포, 업데이트센터 채널 갱신까지 허용한다.
- 진행 중 타이머 강제 초기화, 레시피 기존 row 삭제, `active:false` 마이그레이션 자동 실행은 금지한다.
- CLI/LLM은 prompt envelope가 있어야 깨어난다. monitor/worker/사용자/수동 enqueue 또는 상주 판단 루프가 prompt를 주입하며, 이것은 C&I 판단 권한 제한이 아니다.

## 수정 전 질문
- 이 변경이 조리 누락을 줄이는가.
- 보기 좋아졌지만 상태 판별을 늦추지는 않는가.
- 웹 원본, 호스팅 복사본, Android asset 미러가 함께 맞는가.

## 완료 기준
- 검증: Node smoke, Playwright 레이아웃, 필요 시 Android 빌드
- 전달: 수정 과정은 웹 배포 URL로 확인하고, 요구사항 취합·live 웹 검증이 끝난 뒤에만 Android APK 버전 상승/빌드/업데이트센터 전달
- 자동화 7/7 또는 Hosting 성공은 물리 시각 완료가 아니며, 실제 화면 screenshot과 사용자 visual acceptance가 별도 필요하다.
- 현재 사용자가 관찰한 notebook 2×3은 source의 1×6과 별개인 physical/adoption gap으로 남기며, center/install 후 screenshot이 1×6을 증명할 때까지 완료로 올리지 않는다.
- 2026-08-06 15:12/15:21 실제 폰 screenshot의 timer control row/counter-area 관찰은 현재 mismatch evidence이며 PASS가 아니다. 위 rail·counter geometry 계약과 source/center/install 물리 screenshot이 함께 맞기 전에는 완료로 올리지 않는다.
- 노트북 복구 완료는 Edge 프로세스 실행 성공이 아니라 정확한 `?profile=subnote` 주소, 타이머 6칸 렌더, console/page error 없음, 사용자 화면 증거가 함께 있어야 한다.
- 남은 위험: 실제 매장 화면 밝기/거리, RTDB 공개 규칙, WebView 알림 정책
