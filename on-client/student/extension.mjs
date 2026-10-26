// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
  return {
    renderIdentity({ me, devices, sessions }) {
      // 매 호출마다 새 DOM을 생성한다. 제공 앱이 학생 칸의 이전 DOM을 교체한다.
      const root = document.createElement('section');
      const deviceStates = {
        compliant: '보안 기준 충족',
        noncompliant: '보안 기준 미충족',
        unknown: '확인 불가',
      };
      const sessionStates = {
        active: '활성',
        expired: '만료',
        revoked: '철회됨',
        unknown: '확인 불가',
      };

      function readable(value) {
        return value === null || value === undefined || value === '' ? '확인 불가' : String(value);
      }

      function formatState(states, status) {
        const originalStatus = status == null || status === '' ? 'unknown' : String(status);
        return `${states[originalStatus] || '확인 불가'} (${originalStatus})`;
      }

      function line(parent, name, value) {
        const item = document.createElement('p');
        item.textContent = `${name}: ${value}`;
        parent.append(item);
      }

      function section(title, resource, renderData) {
        const group = document.createElement('section');
        const heading = document.createElement('h4');
        heading.textContent = title;
        group.append(heading);

        // 불러오는 중이거나 실패한 경우에도 전달받은 mode를 숨기지 않는다.
        if (resource?.mode === 'demo') line(group, '자료 모드', '예제 자료 (실제 연결 아님)');
        else if (resource?.mode === 'disconnected') line(group, '연결 상태', '연결 없음');
        else if (resource?.mode === 'unknown') line(group, '연결 상태', '확인 불가');

        if (!resource || resource.status === 'loading') {
          line(group, '조회 상태', '불러오는 중');
        } else if (resource.status === 'error') {
          line(group, '조회 상태', `연결 실패: ${readable(resource.error?.message)}`);
        } else if (resource.status === 'ok') {
          renderData(group, resource.data);
        } else {
          line(group, '조회 상태', '확인 불가');
        }
        root.append(group);
      }

      section('현재 계정·기기·세션', me, (group, data) => {
        const user = data?.user;
        const device = data?.device;
        const session = data?.session;
        line(group, '사용자 이름', readable(user?.label));
        line(group, '사용자 ID', readable(user?.id));
        line(group, '현재 기기 이름', readable(device?.label));
        line(group, '현재 기기 ID', readable(device?.id));
        line(group, '현재 기기 보안 상태', formatState(deviceStates, device?.status));
        line(group, '현재 세션 ID', readable(session?.id));
        line(group, '현재 세션 상태', formatState(sessionStates, session?.status));
      });

      section('등록 기기', devices, (group, data) => {
        if (!Array.isArray(data) || data.length === 0) {
          line(group, '등록 기기', '표시할 기기가 없습니다');
          return;
        }
        for (const device of data) {
          line(group, '기기', `${readable(device?.label)} (ID: ${readable(device?.id)}) · ${formatState(deviceStates, device?.status)}`);
        }
      });

      section('로그인 세션', sessions, (group, data) => {
        if (!Array.isArray(data) || data.length === 0) {
          line(group, '세션', '표시할 세션이 없습니다');
          return;
        }
        for (const session of data) {
          line(group, '세션', `${readable(session?.id)} · ${formatState(sessionStates, session?.status)}`);
        }
      });

      return root;
    },
    renderDecision({ status, mode, data, error, appId } = {}) {
      const root = document.createElement('section');
      const labels = {
        allow: '접근 허용',
        deny: '접근 거부',
        challenge: '추가 확인 필요',
        unknown: '확인 불가',
      };

      function readable(value) {
        return value === null || value === undefined || value === '' ? '확인 불가' : String(value);
      }

      function line(name, value) {
        const item = document.createElement('p');
        item.textContent = `${name}: ${value}`;
        root.append(item);
      }

      // 예제 자료와 미연결 상태를 실제 앱 접근 성공으로 오인하지 않도록 구분한다.
      if (mode === 'demo') line('자료 모드', '예제 자료 (실제 연결 아님)');
      else if (mode === 'disconnected') line('연결 상태', '연결 없음');
      else if (mode === 'unknown') line('연결 상태', '확인 불가');

      if (status === 'idle') {
        line('요청 상태', '업무 앱 하나를 골라 접속을 요청하세요.');
        return root;
      }

      // 진행 중 또는 실패 시에는 선택된 appId를, 완료 시에는 응답의 appId를 사용한다.
      const currentAppId = status === 'ok' ? data?.appId : appId;
      if (currentAppId !== null && currentAppId !== undefined && currentAppId !== '') {
        line('업무 앱 ID', readable(currentAppId));
      }

      if (status === 'loading') {
        line('요청 상태', '판정 확인 중');
      } else if (status === 'error') {
        line('요청 상태', `요청 실패: ${readable(error?.message)}`);
        line('판정 안내', '요청 실패는 접근 거부(deny) 판정이 아닙니다.');
      } else if (status === 'ok') {
        // 공식 판정 네 종류 외에는 확인 불가(unknown)로 표시한다.
        const decision = Object.hasOwn(labels, data?.decision) ? data.decision : 'unknown';
        line('접근 판정', `${labels[decision]} (${decision})`);
        line('판정 이유', readable(data?.reason));
        line('판정 시각', readable(data?.checkedAt));
        if (decision === 'allow') {
          line('판정 안내', '정책상 접근 허용이며 실제 업무 앱 접속 성공을 보장하지 않습니다.');
        } else if (decision === 'challenge') {
          line('판정 안내', '추가 인증 또는 확인이 필요합니다. 이 앱은 확인 절차를 대신 수행하지 않습니다.');
        } else if (decision === 'unknown') {
          line('판정 안내', '판정 확인 불가: 접근 허용으로 간주하지 않습니다.');
        }
      } else {
        line('요청 상태', '판정 확인 불가');
      }

      return root;
    },
    renderEvents({ status, mode, data, error } = {}) {
      // 전달받은 본인 기록만 사용한다. 새 호출마다 필터·선택 상태와 DOM을 새로 만든다.
      const root = document.createElement('section');
      const kindLabels = { access: '접속 기록', xdr: 'XDR 경보' };
      const accessLabels = { allowed: '접근 허용', denied: '접근 거부', unknown: '확인 불가' };
      const sessionLabels = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
      const deviceLabels = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };

      function addText(parent, name, value) {
        const item = document.createElement('p');
        item.textContent = `${name}: ${value}`;
        parent.append(item);
        return item;
      }
      function readable(value) {
        return value === null || value === undefined || value === '' ? '확인 불가' : String(value);
      }
      function appName(appId) {
        return appId === null || appId === undefined || appId === '' ? '앱 확인 불가 (appId 없음)' : String(appId);
      }
      function stateName(labels, code) {
        const actualCode = Object.hasOwn(labels, code) ? code : 'unknown';
        return `${labels[actualCode]}(${actualCode})`;
      }
      function sectionHeading(parent, title) {
        const heading = document.createElement('h4');
        heading.textContent = title;
        parent.append(heading);
      }

      if (mode === 'demo') addText(root, '자료 모드', '예제 자료 (실제 연결 아님)');
      else if (mode === 'disconnected') addText(root, '연결 상태', '연결 없음');
      else if (mode === 'unknown') addText(root, '연결 상태', '확인 불가');

      if (status === 'loading') {
        addText(root, '조회 상태', '기록 불러오는 중');
        return root;
      }
      if (status === 'error') {
        if (error?.code === 'CONTRACT_MISMATCH' || error?.code === 'ENGINE_RESULT_UNVERIFIED') {
          addText(root, '조회 상태', `응답 확인 불가 (${readable(error.code)})`);
        }
        addText(root, '조회 실패', `기록을 불러오지 못했습니다: ${readable(error?.message)}`);
        return root;
      }
      if (status !== 'ok' || !Array.isArray(data)) {
        addText(root, '조회 상태', '기록 확인 불가');
        return root;
      }
      if (data.length === 0) {
        addText(root, '조회 결과', '표시할 기록이 없습니다');
        return root;
      }

      // 복사한 배열만 정렬하므로 서버 응답의 원본 순서·객체를 바꾸지 않는다.
      const events = [...data].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      addText(root, '조회 범위', '서버가 전달한 본인 최근 기록 (최대 40건, 전체 직원 기록 아님)');
      const filters = document.createElement('div');
      const count = document.createElement('p');
      const rows = document.createElement('ul');
      root.append(filters, count, rows);

      function makeFilter(name, values, describe) {
        const label = document.createElement('label');
        label.textContent = name;
        const select = document.createElement('select');
        const all = document.createElement('option');
        all.value = 'all';
        all.textContent = '전체';
        select.append(all);
        for (const value of values) {
          const option = document.createElement('option');
          option.value = value; // 공식 계약의 원래 코드·앱 ID 보존
          option.textContent = describe(value);
          select.append(option);
        }
        select.value = 'all';
        label.append(select);
        filters.append(label);
        return select;
      }
      const distinct = (values) => [...new Set(values)];
      const kindFilter = makeFilter('기록 종류', distinct(events.map(e => e.kind)),
        value => `${kindLabels[value] || '확인 불가'}(${value})`);
      // 앱 ID가 없는 옛 기록은 '전체'에서 보이되 가짜 앱 ID를 필터값으로 만들지 않는다.
      const appFilter = makeFilter('업무 앱', distinct(events.map(e => e.appId)
        .filter(value => typeof value === 'string' && value !== '')), value => value);
      const accessFilter = makeFilter('접속 상태', distinct(events.map(e => e.state.access)),
        value => stateName(accessLabels, value));
      let selectedId = null;
      let controls = [];

      function detailFor(event) {
        const detail = document.createElement('section');
        detail.setAttribute('data-student-event-detail', event.id);
        sectionHeading(detail, '기록 상세');
        addText(detail, '기록 ID', readable(event.id));
        addText(detail, '시각', readable(event.at));
        addText(detail, '종류', `${kindLabels[event.kind] || '확인 불가'}(${readable(event.kind)})`);
        addText(detail, '업무 앱 ID', appName(event.appId));
        addText(detail, '요약', readable(event.summary));
        addText(detail, '접속 상태', stateName(accessLabels, event.state?.access));
        addText(detail, '세션 상태', stateName(sessionLabels, event.state?.session));
        addText(detail, '기기 보안 상태', stateName(deviceLabels, event.state?.device));
        sectionHeading(detail, '근거 (evidence)');
        if (event.evidence?.length) {
          for (const evidence of event.evidence) addText(detail, readable(evidence.id), readable(evidence.text));
        } else addText(detail, '근거', '표시할 근거가 없습니다');
        sectionHeading(detail, '규칙 (rules)');
        if (event.rules?.length) {
          for (const rule of event.rules) addText(detail, readable(rule.id), readable(rule.text));
        } else addText(detail, '규칙', '표시할 규칙이 없습니다');
        // 아직 연결되지 않은 조치는 요청을 보내지 않는 비활성 안내만 제공한다.
        if (Array.isArray(event.supportedActions) && event.supportedActions.length > 0) {
          sectionHeading(detail, '미지원 조치');
          addText(detail, '조치 안내', '조치 실행 연결은 준비 중입니다. 실제 조치를 수행하지 않습니다.');
          for (const action of event.supportedActions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.disabled = true;
            button.textContent = `${action} 미지원`;
            detail.append(button);
          }
        }
        return detail;
      }

      function updateDetails() {
        for (const control of controls) {
          const open = control.event.id === selectedId;
          control.button.setAttribute('aria-expanded', String(open));
          control.slot.replaceChildren();
          if (open) control.slot.append(detailFor(control.event));
        }
      }
      function renderRows() {
        const shown = events.filter(event =>
          (kindFilter.value === 'all' || event.kind === kindFilter.value) &&
          (appFilter.value === 'all' || event.appId === appFilter.value) &&
          (accessFilter.value === 'all' || event.state.access === accessFilter.value));
        count.textContent = `표시 중 ${shown.length}건 / 받은 기록 ${events.length}건`;
        rows.replaceChildren();
        controls = [];
        if (shown.length === 0) {
          const empty = document.createElement('li');
          empty.textContent = '조건에 맞는 기록이 없습니다';
          rows.append(empty);
          selectedId = null;
          return;
        }
        if (!shown.some(event => event.id === selectedId)) selectedId = null;
        for (const event of shown) {
          const item = document.createElement('li');
          item.setAttribute('data-student-event-id', event.id);
          addText(item, '기록 ID', readable(event.id));
          addText(item, '시각', readable(event.at));
          addText(item, '종류', `${kindLabels[event.kind] || '확인 불가'}(${readable(event.kind)})`);
          addText(item, '업무 앱 ID', appName(event.appId));
          addText(item, '요약', readable(event.summary));
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = `${event.id} 상세`;
          const slot = document.createElement('div');
          button.addEventListener('click', () => {
            selectedId = selectedId === event.id ? null : event.id;
            updateDetails();
          });
          item.append(button, slot);
          controls.push({ event, button, slot });
          rows.append(item);
        }
        updateDetails();
      }
      for (const filter of [kindFilter, appFilter, accessFilter]) {
        filter.addEventListener('change', () => {
          selectedId = null;
          renderRows();
        });
      }
      renderRows();
      return root;
    },
    renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
      // 이전 조회 결과가 남지 않도록 매 호출마다 현재 입력으로 새 DOM을 만든다.
      const root = document.createElement('section');
      const deviceLabels = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
      const sessionLabels = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };

      function label(parent, name, value) {
        const p = document.createElement('p');
        p.textContent = `${name}: ${value}`;
        parent.append(p);
      }
      function heading(parent, name) {
        const title = document.createElement('h4');
        title.textContent = name;
        parent.append(title);
      }
      function readable(value) {
        if (value === null || value === undefined || value === '') return '확인 불가';
        const text = String(value);
        // 제공 문자열에 인증 비밀값이 섞여 오더라도 화면이나 도움 요청에 노출하지 않는다.
        const secret = /(?:Bearer\s+\S+|sk-(?:proj-|ant-|svcacct-)?[A-Za-z0-9_-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_ -]?key|authorization|password|비밀번호|토큰)\s*[:=]\s*\S+)/i;
        return secret.test(text) ? '[민감 정보 제외]' : text;
      }
      function statusName(states, status) {
        const code = Object.hasOwn(states, status) ? status : 'unknown';
        return `${states[code]} (${code})`;
      }
      function retry(labelName, resource) {
        const code = resource?.error?.code;
        const message = readable(resource?.error?.message);
        if (typeof code === 'string' && /TIMEOUT/.test(code) || /시간.*초과/.test(message)) {
          label(root, `${labelName} 상태`, '요청 시간 초과');
        }
        label(root, `${labelName} 조회 실패`, message);
        label(root, '다시 시도', labelName === '진단 정보'
          ? '제공 화면의 도움정보 불러오기 버튼을 직접 누르세요. 자동 재시도하지 않습니다.'
          : '위쪽 다시 불러오기 버튼을 직접 누르세요. 자동 재시도하지 않습니다.');
      }
      function resourceList(name, resource, emptyMessage, entry) {
        heading(root, name);
        if (!resource || resource.status === 'loading') {
          label(root, `${name} 조회 상태`, '불러오는 중');
        } else if (resource.status === 'error') {
          retry(name, resource);
        } else if (resource.status === 'ok') {
          if (!Array.isArray(resource.data)) {
            label(root, `${name} 조회 상태`, '확인 불가 (응답 형식 불일치)');
          } else if (resource.data.length === 0) {
            label(root, `${name} 조회 결과`, emptyMessage);
          } else {
            const list = document.createElement('ul');
            for (const row of resource.data) {
              const item = document.createElement('li');
              item.textContent = entry(row);
              list.append(item);
            }
            root.append(list);
          }
        } else {
          label(root, `${name} 조회 상태`, '아직 조회되지 않았습니다');
        }
      }

      if (mode === 'demo') label(root, '자료 모드', '예제 자료 (실제 연결 아님)');
      else if (mode === 'disconnected') label(root, '연결 상태', '연결 없음');
      else if (mode === 'unknown') label(root, '연결 상태', '확인 불가');

      label(root, '관측 범위', '본인 등록 기기 최대 100개, 현재 검증된 세션 한 개만 확인합니다. 과거 전체 세션 목록은 아닙니다.');
      resourceList('기기', devices, '등록된 기기가 없습니다', device =>
        `${readable(device?.label)} (ID: ${readable(device?.id)}) · ${statusName(deviceLabels, device?.status)}`);
      resourceList('세션', sessions, '현재 연결 없음', session =>
        `${readable(session?.id)} · ${statusName(sessionLabels, session?.status)}`);

      heading(root, '알림');
      if (!Array.isArray(notifications) || notifications.length === 0) {
        label(root, '알림 상태', '주의할 알림이 없습니다');
      } else {
        const list = document.createElement('ul');
        for (const item of notifications) {
          const row = document.createElement('li');
          row.textContent = `자료: ${readable(item?.resource)} · 코드: ${readable(item?.code)} · 내용: ${readable(item?.message)}`;
          list.append(row);
        }
        root.append(list);
      }

      heading(root, '진단 정보');
      // 출력과 복사는 정해진 여섯 필드만 사용하며 비정상·비밀값은 그대로 전달하지 않는다.
      function safeField(value, pattern) {
        return typeof value === 'string' && value.length <= 100 && pattern.test(value)
          ? value : '확인 불가';
      }
      const diagnosticsReady = diagnostics?.status === 'ok' && diagnostics.data &&
        typeof diagnostics.data === 'object' && !Array.isArray(diagnostics.data);
      const data = diagnosticsReady ? diagnostics.data : {};
      const safe = {
        requestId: safeField(data.requestId, /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/),
        component: safeField(data.component, /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/),
        version: safeField(data.version, /^v?[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/),
        checkedAt: safeField(data.checkedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/),
        'engine.mode': safeField(data.engine?.mode, /^(connected|demo|disconnected|unknown)$/),
        'engine.code': safeField(data.engine?.code, /^[A-Z][A-Z0-9_]{0,79}$/),
      };
      if (!diagnostics || diagnostics.status === 'idle') {
        label(root, '진단 조회 상태', '아직 도움정보를 불러오지 않았습니다');
      } else if (diagnostics.status === 'loading') {
        label(root, '진단 조회 상태', '불러오는 중');
      } else if (diagnostics.status === 'error') {
        retry('진단 정보', diagnostics);
      } else if (diagnosticsReady) {
        for (const [name, value] of Object.entries(safe)) label(root, name, value);
      } else {
        label(root, '진단 조회 상태', '확인 불가 (응답 형식 불일치)');
      }
      label(root, '도움정보 안내', '도움 요청에 사용할 진단 정보는 사용자가 버튼을 누를 때만 클립보드로 복사합니다.');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '도움정보 복사';
      button.disabled = !diagnosticsReady;
      button.addEventListener('click', async () => {
        if (!diagnosticsReady) return;
        try {
          await navigator.clipboard.writeText(JSON.stringify(safe, null, 2));
          label(root, '복사 상태', '선별된 진단 정보를 복사했습니다');
        } catch {
          label(root, '복사 상태', '클립보드 복사에 실패했습니다. 브라우저 권한을 확인하세요');
        }
      });
      root.append(button);
      return root;
    },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection({ status, mode, data, error, checkedAt, explanationAccepted } = {}) {
      // 연결 점검은 실제 보안 기록의 AI 설명 요청과 별개다.
      // 현재 입력만으로 새 DOM을 반환해 지난 점검 결과가 남지 않도록 한다.
      const root = document.createElement('section');
      function line(name, value) {
        const p = document.createElement('p');
        p.textContent = `${name}: ${value}`;
        root.append(p);
      }
      function readable(value) {
        return value === null || value === undefined || value === '' ? '확인 불가' : String(value);
      }
      const causes = {
        ON_AI_PROVISIONING_PENDING: '앱 권한 준비 중입니다. 담당자에게 계정 연결과 이용 권한을 확인하세요.',
        AI_REQUEST_UNVERIFIED: 'AI 연결 또는 응답을 확인할 수 없습니다. 담당자에게 확인하세요.',
        SUBJECT_SCOPE_UNVERIFIED: '현재 계정과 사건의 연결을 확인할 수 없습니다. 담당자에게 확인하세요.',
        ON_AI_AUTHORIZATION_CHANGED: '점검 중 앱 이용 권한이 변경됐습니다. 담당자에게 권한을 확인하세요.',
        WB_CLCO_AUTH_REQUIRED: '인증이 필요합니다. 계정 연결을 다시 확인하고 담당자에게 문의하세요.',
        WB_CLCO_INVALID_TOKEN: '인증 오류입니다. 앱 전용 연결 상태를 담당자에게 확인하세요.',
        WB_CLCO_ACCESS_BLOCKED: '접근이 제한됐습니다. 앱 이용 권한을 담당자에게 확인하세요.',
        WB_CLCO_COHORT_BUDGET_EXHAUSTED: '반의 AI 사용량이 소진됐습니다. 담당자에게 확인하세요.',
        WB_CLCO_LIMIT_REACHED: 'AI 이용 한도에 도달했습니다. 담당자에게 확인하세요.',
        WB_CLCO_SESSION_CLOSED: '현재 AI 이용 시간이 아닙니다. 이용 시간을 확인하세요.',
        WB_CLCO_RATE_LIMITED: '요청 횟수가 제한됐습니다. 잠시 뒤 직접 다시 점검하세요.',
        WB_CLCO_TIMEOUT: 'AI 요청 시간이 초과됐습니다. 필요하면 직접 다시 점검하세요.',
        REQUEST_TIMEOUT: '요청 시간이 초과됐습니다. 필요하면 직접 다시 점검하세요.',
        ENGINE_TIMEOUT: '서버 확인 시간이 초과됐습니다. 필요하면 직접 다시 점검하세요.',
        TIMEOUT: '요청 시간이 초과됐습니다. 필요하면 직접 다시 점검하세요.',
        WB_CLCO_NETWORK_ERROR: '네트워크 연결에 실패했습니다. 연결을 확인한 뒤 직접 다시 점검하세요.',
        NETWORK_ERROR: '네트워크 연결에 실패했습니다. 연결을 확인한 뒤 직접 다시 점검하세요.',
        WB_CLCO_SERVER_UNAVAILABLE: 'AI 서버에 연결할 수 없습니다. 잠시 뒤 직접 다시 점검하세요.',
        WB_CLCO_REQUEST_FAILED: 'AI 요청에 실패했습니다. 연결 상태를 확인한 뒤 직접 다시 점검하세요.',
        CANCELLED: '사용자가 점검을 취소했습니다. 이전 응답은 현재 결과가 아닙니다.',
        WB_CLCO_CANCELLED: '사용자가 점검을 취소했습니다. 이전 응답은 현재 결과가 아닙니다.',
        REQUEST_CANCELLED: '요청이 취소됐습니다. 이전 응답은 현재 결과가 아닙니다.',
        MODEL_NOT_CONFIGURED: '사용할 AI 모델이 설정되지 않았습니다. 담당자에게 모델 설정을 확인하세요.',
        ON_AI_MODEL_LIST_EMPTY: '이 앱에서 허용된 AI 모델이 없습니다. 담당자에게 모델 허용 설정을 확인하세요.',
        ON_AI_INVALID_INPUT: '요청 입력을 확인할 수 없습니다. 담당자에게 확인하세요.',
        ON_AI_INVALID_OUTPUT: '응답 내용이 계약과 일치하지 않습니다. 담당자에게 확인하세요.',
      };
      function safeErrorMessage(value) {
        if (typeof value !== 'string' || value.length > 500 || value.trim() === ''
          || /(?:Bearer\s+\S+|sk-(?:proj-|ant-|svcacct-)?[A-Za-z0-9_-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_ -]?key|authorization|password|비밀번호|토큰)\s*[:=]\s*\S+)/i.test(value)
          || /[\u0000-\u001f\u007f]/.test(value)) return '자세한 오류 내용을 안전하게 확인할 수 없습니다.';
        return value;
      }
      if (mode === 'demo') line('자료 모드', '예제 자료(demo) · 실제 연결 아님');
      else if (mode === 'disconnected') line('연결 상태', '연결 없음(disconnected)');
      else if (mode === 'unknown') line('연결 상태', '확인 불가(unknown)');

      if (status === 'idle') {
        line('점검 상태', 'AI 연결 점검 전');
      } else if (status === 'loading') {
        line('점검 상태', 'AI 연결 점검 중');
      } else if (status === 'error') {
        const code = Object.hasOwn(causes, error?.code) ? error.code : 'AI_REQUEST_UNVERIFIED';
        line('점검 상태', 'AI 연결 점검 실패 · 연결 성공으로 간주하지 않음');
        line('오류 코드', code);
        line('오류 내용', safeErrorMessage(error?.message));
        line('안내', causes[code]);
      } else if (status === 'ok') {
        if (data?.transportChecked !== true || !['test', 'verified'].includes(data?.audienceAuthorization)
          || !Number.isInteger(data?.modelCount) || data.modelCount < 0) {
          line('점검 상태', 'AI 연결 점검 결과 확인 불가');
        } else {
          line('점검 상태', data.audienceAuthorization === 'test'
            ? '시험 연결 점검(test) · 실제 앱 권한 확인이 아님'
            : '앱 권한 확인 후 점검(verified)');
          line('모델 수(modelCount)', data.modelCount);
          line('점검 시각(checkedAt)', readable(checkedAt));
          line('사건 설명', '연결 점검만 수행했습니다. 사건 설명은 아직 실행하지 않았습니다. 보안 기록에서 별도로 요청해야 합니다.');
        }
      } else {
        line('점검 상태', 'AI 연결 점검 상태 확인 불가');
      }
      line('재점검', '사용자가 제공 화면의 현재 API 연결 점검 버튼을 직접 눌러야 합니다. 자동 재점검하지 않습니다.');
      return root;
    },
    renderExplanation({ event, explanation, checkedAt } = {}) {
  // 18단계: 매 호출마다 새 DOM을 반환한다. 이전 성공 설명이나 속성을 재사용하지 않는다.
  const root = document.createElement('section');
  function line(name, value) {
    const row = document.createElement('p');
    row.textContent = `${name}: ${value}`;
    root.append(row);
  }
  function safeText(value, maximum = 2000) {
    if (typeof value !== 'string' || !value.trim() || value.length > maximum
      || /(?:Bearer\s+\S+|sk-(?:proj-|ant-|svcacct-|on-)?[A-Za-z0-9_-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_ -]?key|authorization|password|비밀번호|토큰)\s*[:=]\s*\S+)/i.test(value)
      || /[\u0000-\u001f\u007f]/.test(value)) return null;
    return value;
  }
  function safeCode(value) {
    return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : null;
  }
  function failed(reason) {
    line('AI 사건 설명', '설명 사용 불가 · 보안 기록은 그대로입니다.');
    line('실패 원인', reason);
    const code = safeCode(explanation?.error?.code);
    if (code) line('오류 코드', code);
    return root;
  }

  // 실패 응답은 이벤트 선택 여부와 관계없이 항상 우선 표시한다.
  if (explanation?.status === 'error') {
    line('AI 사건 설명', 'AI 설명 실패 · 보안 기록은 그대로입니다. 이 상태가 과제 실패를 뜻하지는 않습니다.');
    const code = safeCode(explanation.error?.code);
    if (code) line('오류 코드', code);
    line('오류 내용', safeText(explanation.error?.message, 500) ?? '안전하게 표시할 수 있는 오류 설명이 없습니다.');
    line('안내', '연결·권한 또는 근거 확인 실패 상태입니다. 기존 기록과 업무 앱 판정은 그대로 유지됩니다.');
    return root;
  }
  if (!event || !safeText(event.id, 120)) {
    line('AI 사건 설명', '보안 기록에서 기록을 먼저 고르세요.');
    return root;
  }
  if (explanation?.status === 'loading') {
    line('사건 ID', event.id);
    line('AI 사건 설명', '설명 요청 중 · 이전 결과는 표시하지 않습니다.');
    return root;
  }
  if (explanation?.status !== 'ok') {
    line('사건 ID', event.id);
    line('AI 사건 설명', '설명을 아직 요청하지 않았거나 현재 결과를 확인할 수 없습니다.');
    return root;
  }

  const data = explanation.data;
  if (!data || !safeText(data.summary, 1500) || !Array.isArray(data.evidenceIds)
    || !Array.isArray(data.proposals) || data.requiresHumanConfirmation !== true)
    return failed('설명 응답 형식을 확인할 수 없거나 근거가 부족합니다.');
  if (data.executed !== false)
    return failed('AI가 조치를 실행했다고 표시한 설명은 사용할 수 없습니다. 서버에서 집행된 것으로 판단하지 않습니다.');
  if (!Array.isArray(event.evidence) || !event.evidence.length
    || !Array.isArray(event.rules) || !event.rules.length
    || !event.state || typeof event.state !== 'object'
    || !Array.isArray(event.supportedActions))
    return failed('현재 사건의 근거·규칙·상태를 확인할 수 없습니다(근거 부족).');

  const evidenceById = new Map();
  for (const entry of event.evidence) {
    if (!entry || !safeText(entry.id, 120) || !safeText(entry.text, 500)
      || evidenceById.has(entry.id)) return failed('현재 사건의 근거 ID 또는 근거 글이 올바르지 않습니다.');
    evidenceById.set(entry.id, entry.text);
  }
  const cited = new Set();
  for (const id of data.evidenceIds) {
    if (typeof id !== 'string' || !evidenceById.has(id) || cited.has(id))
      return failed('인용된 근거 ID가 현재 사건의 근거와 일치하지 않습니다(근거 불일치).');
    cited.add(id);
  }
  if (!cited.size || cited.size !== evidenceById.size)
    return failed('현재 사건의 근거를 모두 확인하지 못했습니다(근거 부족 또는 근거 불일치).');
  for (const rule of event.rules) {
    if (!rule || !safeText(rule.id, 120) || !safeText(rule.text, 300))
      return failed('현재 사건의 규칙 ID 또는 규칙 글을 확인할 수 없습니다.');
  }
  for (const proposal of data.proposals) {
    if (!proposal || !safeText(proposal.action, 120) || !safeText(proposal.reason, 500)
      || !event.supportedActions.includes(proposal.action)
      || !Array.isArray(proposal.evidenceIds) || !proposal.evidenceIds.length
      || new Set(proposal.evidenceIds).size !== proposal.evidenceIds.length
      || proposal.evidenceIds.some(id => !cited.has(id)))
      return failed('조치 제안의 지원 여부 또는 인용 근거가 현재 사건과 일치하지 않습니다.');
  }

  // 모든 검증을 마친 성공 결과에만 이 속성을 붙인다.
  root.setAttribute('data-student-explanation-event', event.id);
  if (explanation.mode === 'demo') line('자료 모드', '예제 자료(demo) · 실제 운영 AI 연결이 아닙니다.');
  line('사건 ID', event.id);
  line('AI 설명(참고용)', data.summary);
  line('판단 기준', 'AI 요약은 참고 정보입니다. 사실 판단은 아래 원본 근거·규칙·현재 상태를 기준으로 합니다.');
  for (const id of data.evidenceIds) line('인용 근거', `${id} — ${evidenceById.get(id)}`);
  for (const rule of event.rules) line('적용 규칙', `${rule.id} — ${rule.text}`);
  const stateNames = { access: '접속', session: '세션', device: '기기' };
  const unknown = [];
  for (const key of ['access', 'session', 'device']) {
    if (event.state[key] === 'unknown') unknown.push(`${stateNames[key]}: 확인 불가(unknown)`);
  }
  line('확인 불가 상태', unknown.length ? unknown.join(' / ') : '없음');
  if (data.proposals.length === 0) {
    line('조치 제안', event.supportedActions.length === 0
      ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).' : 'AI가 제안한 조치가 없습니다.');
  } else {
    for (const proposal of data.proposals) {
      line('조치 제안', `${proposal.action} — ${proposal.reason} (근거 ${proposal.evidenceIds.join(', ')})`);
    }
    line('조치 상태', '사람 확인이 필요하며 아직 실행되지 않았습니다.');
  }
  if (safeText(checkedAt, 80)) line('설명 확인 시각', checkedAt);
  line('실행 상태', 'AI 설명·제안은 보안 조치를 실행하지 않습니다.');
  return root;
    },
    renderAction({ status = 'idle', event = null, actionId = null,
      target = null, receipt = null, observation = null, message = null,
      confirmationExpiresAt = null, error = null } = {}) {
      // 19단계: 전달된 상태만 표시한다. 조치 요청·인증 티켓·버튼은 제공 화면의 영역이다.
      // 매번 새로운 DOM을 반환하므로 과거 대상/조치/영수증 결과가 남지 않는다.
      const root = document.createElement('section');
      const safe = (value, max = 500) => typeof value === 'string' && value.trim().length > 0
        && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
        && !/(?:Bearer\s+\S+|sk-(?:proj-|ant-|svcacct-|on-)?[A-Za-z0-9_-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_ -]?key|authorization|password|비밀번호|토큰)\s*[:=]\s*\S+)/i.test(value);
      const identifier = value => safe(value, 120) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
      const print = (name, value) => {
        const row = document.createElement('p');
        row.textContent = `${name}: ${value}`;
        root.append(row);
      };
      const stateText = {
        idle: '아직 미실행(idle)',
        loading: '조치 준비 또는 연동 시스템 결과 조회 중(loading) · 실제 효과 미확인',
        prepared: '준비됨·미실행(prepared) · 대상과 확인 기한을 검토해야 합니다',
        executing: '연동 시스템에 전달 중(executing) · 아직 결과가 확인되지 않았습니다',
        pending: '서버 접수·처리 중(pending) · 접수 응답(ACK)은 조치 효과가 아닙니다',
        denied: '연동 시스템이 조치를 거절했습니다(denied) · 효과 확인 아님',
        failed: '연동 시스템 처리에 실패했습니다(failed) · 효과 확인 아님',
        unknown: '결과 불명(unknown) · 성공이나 효과 없음으로 단정하지 말고 연동 시스템 결과만 다시 조회하세요',
        expired: '확인 기한 만료(expired) · 현재 조치를 다시 준비해야 합니다',
        error: '요청을 처리하지 못했습니다(error) · 실제 조치 효과는 확인되지 않았습니다',
      };
      const currentStatus = Object.hasOwn(stateText, status) || status === 'succeeded' ? status : 'unknown';
      const eventId = identifier(event?.id) ? event.id : null;
      const currentActionId = identifier(actionId) ? actionId : null;
      const requestId = identifier(receipt?.requestId) ? receipt.requestId : null;
      const receiptId = identifier(receipt?.receiptId) ? receipt.receiptId : null;
      const targetId = safe(target?.id, 120) ? target.id : null;
      const generation = Number.isSafeInteger(target?.generation) && target.generation > 0 ? target.generation : null;
      const version = Number.isSafeInteger(receipt?.version) && receipt.version > 0 ? receipt.version : null;
      const observedAt = safe(observation?.observedAt, 100)
        && Number.isFinite(Date.parse(observation.observedAt)) ? observation.observedAt : null;

      // 현재 사건/조치와 다른 접수 내역은 성공이나 현재 작업으로 표시하지 않는다.
      const mismatched = Boolean(receipt && (
        (receipt.eventId != null && receipt.eventId !== eventId)
        || (receipt.actionId != null && receipt.actionId !== currentActionId)
        || (receipt.target != null && (receipt.target.id !== targetId || receipt.target.generation !== generation))
      )) || (currentActionId != null && Array.isArray(event?.supportedActions)
        && !event.supportedActions.includes(currentActionId));
      if (mismatched) {
        print('조치 상태', '현재 사건·조치·대상이 접수 기록과 일치하지 않습니다. 결과 확인 불가(unknown).');
        print('안내', '이전 요청을 현재 요청으로 표시하지 않습니다. 현재 기록과 연동 시스템 결과만 다시 확인하세요.');
        return root;
      }
      if (currentStatus === 'idle') {
        print('조치 상태', stateText.idle);
        if (safe(message)) print('안내', message);
        if (Array.isArray(event?.supportedActions) && event.supportedActions.length === 0)
          print('지원 조치', '현재 연동 시스템이 지원하는 조치가 없어 조치 준비 버튼이 표시되지 않는 것이 정상입니다.');
        print('조작 안내', '조치 준비·확인·결과 재조회·취소는 제공 화면에서 진행합니다. 학생 화면에는 실행 버튼이 없습니다.');
        return root;
      }

      const confirmed = currentStatus === 'succeeded' && observation?.effectApplied === true
        && observedAt !== null && receiptId !== null && requestId !== null
        && eventId !== null && currentActionId !== null && targetId !== null
        && generation !== null && version !== null && receipt?.superseded !== true
        && receipt?.status === 'succeeded';
      const displayState = receipt?.superseded === true
        ? stateText.unknown
        : currentStatus === 'succeeded'
          ? confirmed ? '효과 확인(succeeded) · 연동 시스템의 실제 효과가 관측되었습니다' : stateText.unknown
          : stateText[currentStatus];
      print('조치 상태', displayState);
      if (receipt?.superseded === true)
        print('결과 유효성', '이전 버전의 응답(superseded)은 최신 결과를 대신하지 않습니다. 결과만 다시 조회하세요.');

      if (eventId) print('현재 사건 ID', eventId);
      if (Array.isArray(event?.evidence)) {
        for (const item of event.evidence) if (identifier(item?.id)) print('사건 근거 ID', item.id);
      }
      if (currentActionId) print('조치 ID', currentActionId);
      if (targetId) print('실제 대상 ID', targetId);
      if (generation != null) print('대상 세대(generation)', generation);
      if (currentStatus === 'prepared') {
        if (safe(confirmationExpiresAt, 100)) print('사람 확인 기한(confirmationExpiresAt)', confirmationExpiresAt);
        print('실행 여부', '준비만 완료됐으며 서버에 조치가 전달되거나 집행된 상태가 아닙니다.');
        print('사람 확인', '제공 화면에서 실제 대상과 조치를 확인해야만 후속 요청이 가능합니다.');
      }
      if (requestId) print('요청 ID(requestId)', requestId);
      if (receiptId) print('영수증 ID(receiptId)', receiptId);
      if (version != null) print('영수증 버전(version)', version);
      if (safe(receipt?.status, 40)) print('서버 접수 상태(receipt.status)', receipt.status);
      if (receipt?.replayed === true)
        print('중복 요청 처리', 'replayed: true · 기존 요청의 응답을 재사용했습니다. 조치가 다시 실행됐거나 효과가 확인된 것은 아닙니다.');
      else if (receipt?.replayed === false)
        print('중복 요청 처리', 'replayed: false · 접수 여부와 효과 여부는 별도로 확인합니다.');
      if (currentStatus === 'pending')
        print('집행 여부', 'ACK 수신 · 실제 조치 효과는 확인되지 않았습니다. 연동 시스템 결과만 재조회하세요.');
      if (currentStatus === 'executing' || currentStatus === 'loading')
        print('실행 상태', '요청 중 · 완료나 실제 효과로 판단할 수 없습니다.');
      if (currentStatus === 'unknown' || (currentStatus === 'succeeded' && !confirmed))
        print('결과 재확인', '조치를 중복 전송하지 말고 제공 화면의 「연동 시스템 결과만 재조회」를 사용하세요.');
      if (confirmed) {
        print('관측 시각(observedAt)', observedAt);
        print('실제 효과(effectApplied)', 'effectApplied: true');
        print('확인 근거', '동일 사건·조치·대상과 영수증을 대조한 연동 시스템 관측 결과입니다.');
      }
      if (safe(message)) print('서버 안내', message);
      if (currentStatus === 'error' || currentStatus === 'failed' || currentStatus === 'denied' || currentStatus === 'expired') {
        if (typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code))
          print('안전한 오류 코드', error.code);
        if (safe(error?.message)) print('오류 내용', error.message);
        if (!safe(message) && !safe(error?.message)) print('안내', '안전하게 표시할 수 있는 상세 메시지가 없습니다.');
      }
      print('조작 안내', '확인·집행·결과 재조회·취소는 제공 화면의 기존 버튼을 사용합니다. 조치 화면 취소는 이미 서버에 전달된 효과를 되돌리지 않습니다.');
      if (eventId && requestId) {
        root.setAttribute('data-student-action-event', eventId);
        root.setAttribute('data-student-action-request', requestId);
      }
      return root;
    },
  };
}
