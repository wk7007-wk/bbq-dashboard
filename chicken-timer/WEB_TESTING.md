# ChickenTimer Web Test Setup

공식 문서 기준으로 웹 UI 검증은 Playwright를 기준으로 잡았습니다.

선정 이유:
- Playwright는 `webServer` 설정으로 로컬 정적 페이지를 자동으로 띄운 뒤 테스트할 수 있습니다.
- `expect(locator).toBeVisible()` 같은 자동 재시도 assertion이 있어 UI 비동기 검증이 안정적입니다.
- `expect(page).toHaveScreenshot()` 으로 레이아웃 회귀를 스냅샷으로 잡을 수 있습니다.
- jsdom은 렌더링/레이아웃 계산을 하지 않으므로 실제 웹 UI 검증용으로는 부적합합니다.

## 1. 설치

```bash
cd /root/my-first-project/ChickenTimerBoard
npm install
npx playwright install --only-shell chromium
```

설명:
- 공식 문서상 Playwright는 브라우저를 별도로 설치해야 하며, headless 전용이면 `--only-shell` 로 Chromium headless shell만 받을 수 있습니다.

## 2. 실행

```bash
cd /root/my-first-project/ChickenTimerBoard
npm run test:web
```

옵션:

```bash
npm run test:web:headed
npm run test:web:update-snapshots
```

## 3. 현재 검증 범위

- 숫자 버튼 클릭 시 즉시 카운트 진입
- 분할은 카운트 중에만 노출
- 분할 항목이 메인 숫자 위쪽에 쌓이는지 위치 확인
- 카운트 중 화면 전체 스크린샷 회귀 비교

## 4. 현재 한계

- 이 환경에는 Playwright/Puppeteer/실브라우저가 아직 없어서 지금 즉시 실브라우저 실행은 못 했습니다.
- 첫 실행 시 `running-layout.png` 기준 스냅샷이 생성됩니다. 이후부터 비교가 시작됩니다.
