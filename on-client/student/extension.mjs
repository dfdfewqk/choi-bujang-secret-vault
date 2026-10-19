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
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
