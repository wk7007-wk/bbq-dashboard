(function () {
  'use strict';

  var FIREBASE_BASE = 'https://poskds-4ba60-default-rtdb.asia-southeast1.firebasedatabase.app';
  var FIREBASE_CONFIG = {
    projectId: 'poskds-4ba60',
    appId: '1:965064583329:web:8c06e85c3790107e34e8e0',
    databaseURL: FIREBASE_BASE,
    storageBucket: 'poskds-4ba60.firebasestorage.app',
    apiKey: 'AIzaSyCWq5jMOwBQKXd7AgKWELR4ZKgRQRLN54Y',
    authDomain: 'poskds-4ba60.firebaseapp.com',
    messagingSenderId: '965064583329'
  };
  var CALENDAR_PUBLIC_CONFIG_PATH = '/workschedule_v2/meta/calendar_core/google/public_config';
  var OAUTH_START_PATH = '/api/workschedule/calendar/oauth/start';
  var readyStartPath = '';

  function element(id) {
    return document.getElementById(id);
  }

  function setStatus(message) {
    element('calendarSetupStatus').textContent = message;
  }

  function setCredentialStatus(message) {
    element('calendarCredentialStatus').textContent = message;
  }

  function setContinue(label, disabled) {
    var button = element('calendarConnectContinue');
    button.textContent = label;
    button.disabled = disabled;
  }

  function firebaseUrl(authToken) {
    return FIREBASE_BASE + CALENDAR_PUBLIC_CONFIG_PATH + '.json?auth=' + encodeURIComponent(authToken);
  }

  function isReady(config) {
    return config && config.credentials_configured === true && config.oauth_start_path === OAUTH_START_PATH;
  }

  async function checkConnection() {
    readyStartPath = '';
    setContinue('상태 확인 중', true);
    setStatus('관리자 인증과 연결 서버 상태를 확인하고 있습니다.');
    var user = window.firebase && window.firebase.auth ? window.firebase.auth().currentUser : null;
    if (!user) {
      setCredentialStatus('근무표에서 관리 권한 인증이 먼저 필요합니다.');
      setStatus('근무표로 돌아가 관리자 인증 후 다시 진행해주세요.');
      setContinue('근무표로 돌아가기', false);
      return;
    }
    try {
      var token = await user.getIdToken();
      var response = await fetch(firebaseUrl(token), { cache: 'no-store' });
      if (!response.ok) throw new Error('calendar_config_http_' + response.status);
      var config = await response.json();
      if (!isReady(config)) {
        setCredentialStatus('Google OAuth 클라이언트와 연결 서버 설정이 남아 있습니다.');
        setStatus('사이트 화면은 준비됐고, Google 인증 정보 발급과 서버 등록이 남았습니다.');
        setContinue('연결 상태 다시 확인', false);
        return;
      }
      readyStartPath = OAUTH_START_PATH;
      setCredentialStatus('Google OAuth 연결 준비가 완료됐습니다.');
      setStatus('아래 버튼을 누르고 전용 Google 계정을 선택하세요.');
      setContinue('Google 계정 승인 계속', false);
    } catch (error) {
      setCredentialStatus('연결 설정을 읽을 수 없습니다.');
      setStatus('관리 권한 인증 상태를 확인하고 다시 시도해주세요.');
      setContinue('연결 상태 다시 확인', false);
    }
  }

  function continueConnection() {
    if (!window.firebase.auth().currentUser) {
      window.location.assign('./');
      return;
    }
    if (!readyStartPath) {
      checkConnection();
      return;
    }
    var target = new URL(readyStartPath, window.location.origin);
    target.searchParams.set('return_to', '/hynix/');
    window.location.assign(target.toString());
  }

  function initialize() {
    element('calendarConnectContinue').addEventListener('click', continueConnection);
    element('calendarConnectRefresh').addEventListener('click', checkConnection);
    if (!window.firebase || !window.firebase.initializeApp || !window.firebase.auth) {
      setCredentialStatus('인증 모듈을 불러오지 못했습니다.');
      setStatus('새로고침 후 다시 시도해주세요.');
      setContinue('새로고침 필요', true);
      return;
    }
    if (!window.firebase.apps || !window.firebase.apps.length) window.firebase.initializeApp(FIREBASE_CONFIG);
    window.firebase.auth().onAuthStateChanged(checkConnection);
  }

  initialize();
})();
