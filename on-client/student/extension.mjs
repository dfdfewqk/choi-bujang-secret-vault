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
        line(group, '현재 기기 보안 상태', deviceStates[device?.status] || '확인 불가');
        line(group, '현재 세션 ID', readable(session?.id));
        line(group, '현재 세션 상태', sessionStates[session?.status] || '확인 불가');
      });

      section('등록 기기', devices, (group, data) => {
        if (!Array.isArray(data) || data.length === 0) {
          line(group, '등록 기기', '표시할 기기가 없습니다');
          return;
        }
        for (const device of data) {
          line(group, '기기', `${readable(device?.label)} (ID: ${readable(device?.id)}) · ${deviceStates[device?.status] || '확인 불가'}`);
        }
      });

      section('로그인 세션', sessions, (group, data) => {
        if (!Array.isArray(data) || data.length === 0) {
          line(group, '세션', '표시할 세션이 없습니다');
          return;
        }
        for (const session of data) {
          line(group, '세션', `${readable(session?.id)} · ${sessionStates[session?.status] || '확인 불가'}`);
        }
      });

      return root;
    },
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
