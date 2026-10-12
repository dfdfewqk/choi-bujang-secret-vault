// Auth-result labels for the BYTE BACK UI. Display-only; API ownership is always checked server-side.
export function isSignupEmailReturn(fragment = '') {
  const params = new URLSearchParams(String(fragment).replace(/^#/, ''));
  // Parse the callback intent only. Never print or persist access/refresh tokens.
  return params.get('type') === 'signup' && params.has('access_token');
}

export function getAuthCompletion(session, signupEmailReturn = false) {
  if (!session?.user) return null;
  const emailVerified = Boolean(session.user.email_confirmed_at);
  const confirmationReturn = signupEmailReturn && emailVerified;
  return {
    title: confirmationReturn ? '이메일 인증 완료!' : '로그인 완료!',
    description: confirmationReturn
      ? '이메일 인증을 마쳤습니다. 내 방어 자료실에 접속했습니다.'
      : '방어 자료실에 정상적으로 로그인했습니다.',
    loginLabel: '✓ 로그인 완료',
    emailLabel: emailVerified ? '✓ 이메일 인증 완료' : '이메일 인증 대기',
    emailVerified,
  };
}
