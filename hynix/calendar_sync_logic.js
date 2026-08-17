(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HynixCalendarSyncLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SHARED_FIELDS = Object.freeze([
    'employee_identity',
    'work_date',
    'start_time',
    'end_time',
    'role',
    'off',
    'clear_or_delete',
    'date_move'
  ]);
  var OAUTH_START_PATH = '/api/workschedule/calendar/oauth/start';

  function dateKey(value) {
    var text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function safeKey(value) {
    return String(value || 'calendar_item')
      .trim()
      .replace(/[.#$\[\]\/\s|:]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 180) || 'calendar_item';
  }

  function buildOutboxItem(input) {
    var now = Number(input && input.nowMs != null ? input.nowMs : Date.now());
    var canonicalRoot = String(input && input.canonicalRoot || '/workschedule_v2').replace(/\/$/, '');
    var entity = input && input.entity === 'fixed_schedule' ? 'fixed_schedule' : 'daily_override';
    var date = entity === 'daily_override' ? dateKey(input && input.dateKey) : '';
    var employeeId = String(input && input.empId || '').trim();
    if (!employeeId || (entity === 'daily_override' && !date)) {
      throw new Error('invalid_calendar_outbox_target');
    }
    var row = input && input.row && typeof input.row === 'object' ? input.row : {};
    var revision = String(row.updated_at_ms != null ? row.updated_at_ms : now);
    var canonicalKey = entity === 'fixed_schedule' ? 'fixed|' + employeeId : 'daily|' + date + '|' + employeeId;
    var action = entity === 'fixed_schedule' ? 'reconcile_fixed_horizon' : String(row.state || input && input.action || 'shift');
    var id = safeKey(canonicalKey + '|' + action + '|' + revision);
    return {
      id: id,
      idempotency_key: id,
      schema_version: 'workschedule.calendar_core.outbox.v1',
      source: 'hynix_portal',
      sync_profile: 'shared_schedule_intersection_v1',
      canonical_root: canonicalRoot,
      metadata_root: canonicalRoot + '/meta/calendar_core/google',
      canonical_key: canonicalKey,
      entity: entity,
      date: date || null,
      employee_id: employeeId,
      action: action,
      canonical_revision: revision,
      canonical_path: entity === 'fixed_schedule'
        ? canonicalRoot + '/fixed_schedules/' + employeeId
        : canonicalRoot + '/overrides/' + date + '/' + employeeId,
      created_at_ms: now,
      status: 'pending',
      attempt_count: 0,
      next_attempt_at_ms: now
    };
  }

  function normalizeOAuthStartPath(value) {
    return String(value || '').trim() === OAUTH_START_PATH ? OAUTH_START_PATH : '';
  }

  function calendarConnectionView(publicConfig, role) {
    var config = publicConfig && typeof publicConfig === 'object' ? publicConfig : {};
    var connected = config.token_connected === true || config.live_auth_ready === true;
    var startPath = normalizeOAuthStartPath(config.oauth_start_path);
    var owner = String(role || '') === 'owner';
    if (connected) {
      return { label: '구글 캘린더 연결됨', status: '전용 계정 연결 완료', disabled: true, startPath: '', action: 'connected' };
    }
    if (!owner) {
      return { label: '관리자 인증 후 연결', status: '상단에서 관리 권한 인증이 필요합니다.', disabled: true, startPath: '', action: 'owner_auth' };
    }
    if (!startPath || config.credentials_configured !== true) {
      return {
        label: 'Google 캘린더 연결',
        status: '연결 서버 설정이 남아 있습니다. 버튼을 누르면 현재 상태를 확인합니다.',
        disabled: false,
        startPath: '',
        action: 'setup_status'
      };
    }
    return { label: 'Google 캘린더 연결', status: '개인폰에서 전용 Google 계정을 선택합니다.', disabled: false, startPath: startPath, action: 'oauth' };
  }

  return {
    SHARED_FIELDS: SHARED_FIELDS,
    OAUTH_START_PATH: OAUTH_START_PATH,
    buildOutboxItem: buildOutboxItem,
    normalizeOAuthStartPath: normalizeOAuthStartPath,
    calendarConnectionView: calendarConnectionView
  };
});
