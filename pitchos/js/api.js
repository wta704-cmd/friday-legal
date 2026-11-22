// Supabase access for the web client: session storage, token refresh, and one
// thin wrapper per endpoint the UI uses. Every call goes through PostgREST/RPC
// with the caller's JWT, so RLS decides what a user may see — the client never
// filters security-critical data on its own.

import { SUPABASE_URL, SUPABASE_ANON_KEY, SESSION_KEY } from './config.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }

  get isAuthError() {
    return this.status === 401 || this.code === 'session_expired';
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
//
// 세션은 localStorage에 둔다: 아이폰에서 탭을 닫거나 홈 화면(PWA)에서 나갔다 와도
// 로그인이 유지된다. '로그인 유지'를 끄면 sessionStorage로 들어가 탭과 함께 끝난다.
//
// Safari는 탭과 홈 화면 앱을 동시에 살려 둘 수 있고, 마지막에 갱신한 쪽만 유효한
// refresh_token을 가진다. 그래서 ① 시작할 때 두 저장소를 모두 읽고, ② storage
// 이벤트로 다른 탭의 갱신을 메모리에 반영하고, ③ 갱신 직전에 저장소를 다시 읽어
// 이미 회전된 토큰이면 그 토큰을 쓴다(이전 토큰 재사용은 세션 폐기로 이어진다).

let session = null;
let persistSession = true; // '로그인 유지' 기본 ON

function readRaw(kind) {
  try {
    const store = kind === 'tab' ? window.sessionStorage : window.localStorage;
    return store.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function parseSession(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && value.access_token ? value : null;
  } catch {
    return null;
  }
}

function storedSession() {
  return parseSession(readRaw('local')) || parseSession(readRaw('tab'));
}

function storageKind() {
  if (readRaw('local')) return 'local';
  if (readRaw('tab')) return 'tab';
  return persistSession ? 'local' : 'tab';
}

function writeRaw(entry, kind = null) {
  const target = entry ? kind || storageKind() : null;
  try {
    if (!entry) {
      window.localStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    const raw = JSON.stringify(entry);
    if (target === 'tab') {
      window.sessionStorage.setItem(SESSION_KEY, raw);
      window.localStorage.removeItem(SESSION_KEY);
    } else {
      window.localStorage.setItem(SESSION_KEY, raw);
      window.sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* 사파리 프라이빗 모드: 메모리 세션으로 이 탭에서만 동작한다 */
  }
}

export function getSession() {
  if (session) return session;
  session = storedSession();
  return session;
}

function saveSession(next, { persist = null } = {}) {
  if (persist !== null) persistSession = Boolean(persist);
  session = next;
  writeRaw(next, next ? (persist === null ? storageKind() : persist ? 'local' : 'tab') : null);
  scheduleRefresh(next);
  return session;
}

export function clearSession() {
  saveSession(null);
}

export function currentUser() {
  return getSession()?.user || null;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const BASES = {
  rest: '/rest/v1',
  auth: '/auth/v1',
  functions: '/functions/v1',
};

function buildUrl(base, path) {
  return `${SUPABASE_URL}${BASES[base] || BASES.rest}${path}`;
}

async function send(url, { method = 'GET', body, token, headers = {} }) {
  const finalHeaders = { apikey: SUPABASE_ANON_KEY, ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;
  else if (!finalHeaders.Authorization) finalHeaders.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;

  const init = { method, headers: finalHeaders };
  if (body !== undefined && body !== null) {
    if (typeof body === 'string' || body instanceof Blob) {
      init.body = body;
    } else {
      finalHeaders['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError('네트워크에 연결하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.', {
      code: 'network',
    });
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { ok: response.ok, status: response.status, data };
}

const MESSAGE_MAP = [
  ['invalid login credentials', '이메일 또는 비밀번호가 올바르지 않습니다.'],
  ['email not confirmed', '이메일 인증이 아직 끝나지 않았습니다. 받은 메일의 인증 링크를 먼저 눌러 주세요.'],
  ['email_not_confirmed', '이메일 인증이 아직 끝나지 않았습니다. 받은 메일의 인증 링크를 먼저 눌러 주세요.'],
  ['user already registered', '이미 가입된 이메일입니다. 로그인해 주세요.'],
  ['already been registered', '이미 가입된 이메일입니다. 로그인해 주세요.'],
  ['over_email_send_rate_limit', '메일 발송 한도를 넘었습니다. 잠시 뒤(최대 1시간) 다시 시도해 주세요.'],
  ['email rate limit exceeded', '메일 발송 한도를 넘었습니다. 잠시 뒤(최대 1시간) 다시 시도해 주세요.'],
  ['for security purposes', '요청이 너무 잦습니다. 잠시 뒤 다시 시도해 주세요.'],
  ['password should be at least', '비밀번호는 6자 이상이어야 합니다.'],
  ['unable to validate email', '이메일 주소 형식을 확인해 주세요.'],
  ['invalid format', '입력 형식이 올바르지 않습니다.'],
  ['invalid invite code', '초대코드를 확인해 주세요. 6자리 코드입니다.'],
  ['rsvp deadline passed', '투표가 마감되어 바꿀 수 없습니다.'],
  ['deadline not reached', '마감 시각 전에는 투표를 마감할 수 없습니다.'],
  ['a team must keep at least one active owner', '팀에는 팀장이 한 명 이상 남아야 합니다.'],
  ['only a team manager', '팀장·매니저만 할 수 있습니다.'],
  ['only an owner', '팀장만 할 수 있습니다.'],
  ['not a member of this match', '이 경기의 팀원만 투표할 수 있습니다.'],
  ['team name must be', '팀 이름은 1~30자로 입력해 주세요.'],
  ['unknown rsvp status', '투표 값을 확인해 주세요.'],
  ['permission denied', '이 작업을 할 권한이 없습니다.'],
  ['bucket not found', '파일 저장소를 찾지 못했습니다.'],
];

function describe(status, data) {
  const raw =
    (data && (data.msg || data.message || data.error_description)) ||
    (data && typeof data.error === 'string' ? data.error : null) ||
    (typeof data === 'string' ? data : null) ||
    '';
  const lower = String(raw).toLowerCase();
  for (const [needle, korean] of MESSAGE_MAP) {
    if (lower.includes(needle)) return korean;
  }
  if (status === 401) return '로그인이 필요합니다. 다시 로그인해 주세요.';
  if (status === 403) return '이 작업을 할 권한이 없습니다.';
  if (status === 404) return '요청한 정보를 찾지 못했습니다.';
  if (status === 409) return '이미 처리된 요청입니다.';
  if (status === 429) return '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.';
  if (status >= 500) return '서버에서 요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
  return raw || `요청을 처리하지 못했습니다. (${status})`;
}

function toError(status, data) {
  const code = (data && (data.error_code || data.code)) || null;
  return new ApiError(describe(status, data), { status, code, body: data });
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

// 만료 5분 전에 미리 갱신한다. iOS는 백그라운드에서 타이머를 멈추므로 이 타이머는
// 보조 수단이고, 확실한 갱신은 ① 요청 직전(authorize) ② 앱이 다시 앞으로 나올 때
// (app.js의 visibilitychange/pageshow) ③ 401 응답 후 재시도에서 이뤄진다.
const REFRESH_LEAD_MS = 5 * 60_000;
let refreshTimer = null;
let refreshPromise = null;

function scheduleRefresh(entry) {
  if (typeof window === 'undefined' || !window.setTimeout) return;
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = null;
  if (!entry?.expires_at) return;
  const delay = entry.expires_at - Date.now() - REFRESH_LEAD_MS;
  refreshTimer = window.setTimeout(
    () => {
      refreshTimer = null;
      if (!getSession()) return;
      refreshSession().catch(() => undefined);
    },
    Math.max(2_000, Math.min(delay, 6 * 3_600_000)),
  );
}

function sessionExpired() {
  return new ApiError('로그인 정보가 만료되었습니다. 다시 로그인해 주세요.', {
    status: 401,
    code: 'session_expired',
  });
}

export async function refreshSession() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const current = getSession();
    if (!current?.refresh_token) {
      clearSession();
      throw sessionExpired();
    }

    // 다른 탭(또는 홈 화면 앱)이 먼저 갱신해 저장소가 더 새로우면 그 토큰을 쓴다.
    const stored = storedSession();
    if (
      stored?.access_token &&
      stored.refresh_token !== current.refresh_token &&
      (!stored.expires_at || stored.expires_at > Date.now() + 30_000)
    ) {
      session = stored;
      scheduleRefresh(stored);
      return stored;
    }

    const { ok, status, data } = await send(
      buildUrl('auth', '/token?grant_type=refresh_token'),
      { method: 'POST', body: { refresh_token: current.refresh_token } },
    );

    if (!ok || !data?.access_token) {
      // 회전 경합: 방금 다른 곳이 갱신해 저장소에 새 토큰이 들어왔다면 그걸 채택한다.
      const newer = storedSession();
      if (
        newer?.access_token &&
        newer.refresh_token &&
        newer.refresh_token !== current.refresh_token &&
        (!newer.expires_at || newer.expires_at > Date.now())
      ) {
        session = newer;
        scheduleRefresh(newer);
        return newer;
      }
      // 서버 장애는 세션을 지우지 않는다 — 다음 요청에서 다시 시도한다.
      if (status >= 500) {
        throw new ApiError('서버에서 로그인 연장을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.', {
          status,
        });
      }
      // 400/401(invalid_grant 등)만 진짜 만료다.
      clearSession();
      throw sessionExpired();
    }

    return saveSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token || current.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      user: data.user
        ? { id: data.user.id, email: data.user.email }
        : current.user,
      refreshed_at: Date.now(),
    });
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

/**
 * 앱이 다시 앞으로 나올 때 부른다. 만료가 가까우면 먼저 갱신하고, 오프라인처럼
 * 서버에 닿지 못한 경우에는 지금 세션 그대로 돌려준다(로그아웃시키지 않는다).
 */
export async function ensureFreshSession({ leadMs = 10 * 60_000 } = {}) {
  const current = getSession();
  if (!current?.access_token) return null;
  const due = !Number.isFinite(current.expires_at) || current.expires_at - Date.now() < leadMs;
  if (!due) {
    scheduleRefresh(current);
    return current;
  }
  try {
    return await refreshSession();
  } catch (error) {
    if (error instanceof ApiError && error.isAuthError) throw error;
    return current;
  }
}

async function accessToken() {
  const current = getSession();
  if (!current?.access_token) {
    throw new ApiError('로그인이 필요합니다.', { status: 401, code: 'session_expired' });
  }
  if (!current.expires_at || current.expires_at - Date.now() < 60_000) {
    const refreshed = await refreshSession();
    return refreshed.access_token;
  }
  return current.access_token;
}

async function authorize() {
  const current = getSession();
  if (!current?.access_token) {
    throw new ApiError('로그인이 필요합니다.', { status: 401, code: 'session_expired' });
  }
  // Expiry is advisory: a token can be revoked server-side while its clock is
  // still valid, and a 401 from PostgREST triggers one refresh-and-retry below.
  if (current.expires_at && current.expires_at - Date.now() < 60_000) {
    const refreshed = await refreshSession();
    return refreshed.access_token;
  }
  return current.access_token;
}

async function request(path, { method = 'GET', body, base = 'rest', prefer, retry = true } = {}) {
  const token = await authorize();
  const headers = {};
  if (prefer) headers.Prefer = prefer;
  const { ok, status, data } = await send(buildUrl(base, path), { method, body, token, headers });

  if (status === 401 && retry) {
    await refreshSession();
    return request(path, { method, body, base, prefer, retry: false });
  }
  if (!ok) throw toError(status, data);
  return data;
}

function qs(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function adopt(entry, { persist = null } = {}) {
  return saveSession(
    {
      access_token: entry.access_token,
      refresh_token: entry.refresh_token,
      expires_at: Date.now() + (Number(entry.expires_in) || 3600) * 1000,
      user: entry.user ? { id: entry.user.id, email: entry.user.email } : null,
      signed_in_at: Date.now(),
    },
    { persist },
  );
}

export const auth = {
  /** @param {{persist?: boolean}} opts persist=false면 이 탭에서만 로그인 유지 */
  async signIn(email, password, { persist = true } = {}) {
    const { ok, status, data } = await send(buildUrl('auth', '/token?grant_type=password'), {
      method: 'POST',
      body: { email: email.trim(), password },
    });
    if (!ok || !data?.access_token) throw toError(status, data);
    return adopt(data, { persist });
  },

  /** @returns {{ needsConfirm: boolean, email: string }} */
  async signUp(email, password, displayName, { persist = true } = {}) {
    const { ok, status, data } = await send(buildUrl('auth', '/signup'), {
      method: 'POST',
      body: {
        email: email.trim(),
        password,
        data: { display_name: displayName.trim(), platform: 'apple' },
      },
    });
    if (!ok) throw toError(status, data);
    if (data?.access_token) {
      adopt(data, { persist });
      return { needsConfirm: false, email };
    }
    // Email confirmation is on: no session until the link in the mail is opened.
    return { needsConfirm: true, email };
  },

  async recover(email) {
    const { ok, status, data } = await send(buildUrl('auth', '/recover'), {
      method: 'POST',
      body: { email: email.trim() },
    });
    if (!ok) throw toError(status, data);
    return true;
  },

  async signOut() {
    const current = getSession();
    if (current?.access_token) {
      try {
        await send(buildUrl('auth', '/logout'), { method: 'POST', token: current.access_token });
      } catch {
        /* the local session is cleared regardless */
      }
    }
    clearSession();
  },

  /** Server-side identity check used on boot. */
  async me() {
    let data;
    try {
      data = await request('/user', { base: 'auth' });
    } catch (error) {
      // GoTrue answers 403 user_not_found when the account behind the stored
      // token was deleted (e.g. the same phone signed out by deleting it), and
      // 401 when the token expired. Both mean "log in again", not "retry".
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        throw new ApiError('로그인이 필요합니다. 다시 로그인해 주세요.', {
          status: 401,
          code: 'session_expired',
        });
      }
      throw error;
    }
    const current = getSession();
    if (current) {
      saveSession({ ...current, user: { id: data.id, email: data.email } });
    }
    return data;
  },
};

// ---------------------------------------------------------------------------
// Data endpoints
// ---------------------------------------------------------------------------

export const profiles = {
  async mine() {
    const rows = await request('/rpc/my_profile', { method: 'POST', body: {} });
    return Array.isArray(rows) ? rows[0] : rows;
  },

  async update(patch) {
    const uid = currentUser()?.id;
    if (!uid) throw new ApiError('로그인이 필요합니다.', { status: 401 });
    // No `select` here: 0006 revoked SELECT on birth_year/height_cm/weight_kg
    // from every teammate, so a representation of the whole row is refused.
    // Read the values back through my_profile() instead.
    await request(`/profiles?id=eq.${uid}`, {
      method: 'PATCH',
      body: patch,
      prefer: 'return=minimal',
    });
    return this.mine();
  },
};

export const teams = {
  list() {
    return request(
      `/teams${qs({
        select: 'id,name,invite_code,mode,plan,crest_initials,crest_color,logo_url,speed_preset,created_at',
        order: 'created_at.asc',
      })}`,
    );
  },

  create(name, mode) {
    return request('/rpc/create_team_with_owner', {
      method: 'POST',
      body: { p_name: name, p_mode: mode },
    });
  },

  join(code) {
    return request('/rpc/join_team_with_code', {
      method: 'POST',
      body: { p_code: code },
    });
  },

  members(teamId) {
    return request(
      `/team_member_directory${qs({
        team_id: `eq.${teamId}`,
        select: 'team_id,user_id,role,status,jersey_number,position,display_name,avatar_path,play_mode',
        order: 'role.asc,display_name.asc',
      })}`,
    );
  },

  setPosition(teamId, userId, position) {
    return request('/rpc/set_member_position', {
      method: 'POST',
      body: { p_team: teamId, p_user: userId, p_position: position },
    });
  },

  leave(teamId) {
    return request('/rpc/leave_team', { method: 'POST', body: { p_team: teamId } });
  },

  removeMember(teamId, userId) {
    return request('/rpc/remove_team_member', {
      method: 'POST',
      body: { p_team: teamId, p_user: userId },
    });
  },
};

const MATCH_COLUMNS =
  'id,team_id,title,kind,kickoff_at,quarter_count,quarter_minutes,mode,is_indoor,status,rsvp_deadline_at,opponent_name,pitch_name';

export const matches = {
  list(teamId) {
    return request(
      `/matches${qs({
        team_id: `eq.${teamId}`,
        select: MATCH_COLUMNS,
        order: 'kickoff_at.desc',
        limit: 60,
      })}`,
    );
  },

  create(payload) {
    return request('/rpc/create_match', {
      method: 'POST',
      body: {
        p_team: payload.teamId,
        p_kind: payload.kind,
        p_kickoff: payload.kickoff,
        p_pitch_name: payload.pitchName || null,
        p_indoor: Boolean(payload.indoor),
        p_quarter_count: payload.quarterCount,
        p_quarter_minutes: payload.quarterMinutes,
        p_opponent: payload.opponent || null,
      },
    });
  },

  rsvps(matchId) {
    return request(
      `/match_rsvp_directory${qs({
        match_id: `eq.${matchId}`,
        select:
          'match_id,user_id,status,late_eta_min,responded_at,display_name,role,jersey_number,position',
        order: 'role.asc,display_name.asc',
      })}`,
    );
  },

  setRsvp(matchId, status, etaMinutes) {
    const body = { p_match: matchId, p_status: status };
    if (status === 'late') body.p_eta_min = Number(etaMinutes) || 0;
    return request('/rpc/upsert_rsvp', { method: 'POST', body });
  },

  finalize(matchId) {
    return request('/rpc/finalize_rsvp', { method: 'POST', body: { p_match: matchId } });
  },

  lineups(matchId) {
    return request(
      `/match_lineups${qs({
        match_id: `eq.${matchId}`,
        select: 'user_id,quarter,position,is_starter',
        order: 'quarter.asc',
      })}`,
    );
  },

  saveLineup(matchId, rows) {
    return request('/rpc/replace_lineup', {
      method: 'POST',
      body: {
        p_match: matchId,
        p_rows: rows.map((row) => ({
          user_id: row.user_id,
          quarter: row.quarter,
          position: row.position || null,
          is_starter: Boolean(row.is_starter),
        })),
      },
    });
  },
};

export const pitches = {
  list(teamId) {
    return request(
      `/pitches${qs({
        team_id: `eq.${teamId}`,
        select:
          'id,name,mode,width_m,height_m,corner_near_left_lat,corner_near_left_lon,corner_near_right_lat,corner_near_right_lon,corner_far_right_lat,corner_far_right_lon,corner_far_left_lat,corner_far_left_lon,is_indoor,created_at',
        order: 'created_at.desc',
        limit: 50,
      })}`,
    );
  },

  create(row) {
    return request(`/pitches${qs({ select: 'id,name' })}`, {
      method: 'POST',
      body: row,
      prefer: 'return=representation',
    });
  },
};

const SESSION_COLUMNS =
  'id,match_id,user_id,client_session_uuid,is_indoor,share_with_team,started_at,ended_at,point_count,record_source,sync_policy,platform,device_model';

export const sessions = {
  mine(userId) {
    return request(
      `/player_sessions${qs({
        user_id: `eq.${userId}`,
        select: SESSION_COLUMNS,
        order: 'started_at.desc',
        limit: 60,
      })}`,
    );
  },

  quarters(sessionId) {
    return request(
      `/quarter_stats${qs({
        session_id: `eq.${sessionId}`,
        select:
          'quarter,is_rest,active_seconds,distance_m,distance_per_min,top_speed_kmh,sprint_count,high_accel_count,high_decel_count,avg_heart_rate,max_heart_rate',
        order: 'quarter.asc',
      })}`,
    );
  },

  /** All quarter rows of several sessions in one request (PostgREST `in.(…)`). */
  quartersFor(sessionIds) {
    if (!sessionIds?.length) return Promise.resolve([]);
    return request(
      `/quarter_stats${qs({
        session_id: `in.(${sessionIds.join(',')})`,
        select:
          'session_id,quarter,is_rest,active_seconds,distance_m,distance_per_min,top_speed_kmh,sprint_count,high_accel_count,high_decel_count,avg_heart_rate,max_heart_rate',
        order: 'quarter.asc',
      })}`,
    );
  },

  setShare(sessionId, share) {
    return request(`/player_sessions${qs({ id: `eq.${sessionId}`, select: 'id,share_with_team' })}`, {
      method: 'PATCH',
      body: { share_with_team: Boolean(share) },
      prefer: 'return=representation',
    });
  },

  /** RLS returns the caller's own sessions plus teammates' shared ones. */
  forMatch(matchId) {
    return request(
      `/player_sessions${qs({
        match_id: `eq.${matchId}`,
        select: SESSION_COLUMNS,
        order: 'started_at.asc',
        limit: 60,
      })}`,
    );
  },

  /**
   * 애플워치·건강 앱에서 내보낸 GPX를 요약해 세션 1행 + 쿼터 N행으로 저장한다.
   * (RLS: player_sessions.user_id / quarter_stats.user_id = auth.uid())
   * @param {{matchId?: string|null, analysis: object, deviceModel?: string,
   *          shareWithTeam?: boolean, clientSessionUuid?: string}} input
   */
  async uploadWatch({ matchId = null, analysis, deviceModel = 'Apple Watch', shareWithTeam = false, clientSessionUuid = null }) {
    const uid = currentUser()?.id;
    if (!uid) throw new ApiError('로그인이 필요합니다.', { status: 401 });
    if (!analysis?.quarters?.length) throw new ApiError('분석할 기록이 없습니다.', { status: 400 });

    const startedAt = new Date(analysis.startedAt).toISOString();
    const endedAt = new Date(analysis.endedAt).toISOString();
    const seconds = Math.max(1, (analysis.endedAt - analysis.startedAt) / 1000);
    // sample_rate_hz는 numeric(3,2) 0.2~10: 워치는 보통 1Hz, 3초 간격 파일이면 0.33Hz.
    const sampleRate = Math.min(10, Math.max(0.2, Math.round((analysis.pointCount / seconds) * 100) / 100));

    const inserted = await request(`/player_sessions${qs({ select: 'id' })}`, {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        match_id: matchId || null,
        user_id: uid,
        client_session_uuid: clientSessionUuid || crypto.randomUUID(),
        platform: 'apple',
        device_model: String(deviceModel || 'Apple Watch').slice(0, 80),
        is_indoor: false,
        share_with_team: Boolean(shareWithTeam),
        sample_rate_hz: sampleRate,
        started_at: startedAt,
        ended_at: endedAt,
        point_count: analysis.pointCount,
        record_source: 'watch',
        sync_policy: 'summary_only',
        engine_version: 'web-gpx-1.0.0',
      },
    });
    const sessionId = inserted?.[0]?.id;
    if (!sessionId) throw new ApiError('세션을 저장하지 못했습니다.', { status: 500 });

    const rows = analysis.quarters.map((quarter) => ({
      session_id: sessionId,
      match_id: matchId || null,
      user_id: uid,
      quarter: quarter.quarter,
      is_rest: false,
      active_seconds: quarter.activeSeconds,
      distance_m: quarter.distanceM,
      distance_per_min: quarter.distancePerMin,
      top_speed_kmh: quarter.topSpeedKmh,
      sprint_count: quarter.sprintCount,
      avg_heart_rate: quarter.avgHeartRate,
      max_heart_rate: quarter.maxHeartRate,
      engine_version: 'web-gpx-1.0.0',
    }));
    await request('/quarter_stats', { method: 'POST', prefer: 'return=minimal', body: rows });

    return { sessionId, quarterCount: rows.length };
  },
};

export const support = {
  create({ category, body, deviceInfo, appVersion, clientUuid }) {
    return request('/support_tickets', {
      method: 'POST',
      body: {
        client_ticket_uuid: clientUuid,
        category,
        body,
        device_info: deviceInfo || '',
        app_version: appVersion || '',
      },
      prefer: 'return=representation',
    });
  },

  list() {
    return request(
      `/support_tickets${qs({
        select: 'id,category,body,status,created_at,updated_at',
        order: 'created_at.desc',
        limit: 20,
      })}`,
    );
  },
};

export const ops = {
  config() {
    return request(
      `/app_config${qs({
        id: 'eq.default',
        select: 'maintenance_mode,maintenance_message,maintenance_until,feature_flags',
        limit: 1,
      })}`,
    ).then((rows) => (Array.isArray(rows) ? rows[0] : rows));
  },
};

export const account = {
  async remove() {
    let data;
    try {
      data = await request('/delete-account', { method: 'POST', base: 'functions', body: {} });
    } catch (error) {
      // The deployed edge function answers OPTIONS with 405 and sends no CORS
      // headers, so a browser blocks the call before it leaves the page. The
      // SECURITY DEFINER RPC removes the same rows (profile → teams → matches →
      // auth user) through PostgREST, which does allow this origin.
      if (!(error instanceof ApiError) || (error.code !== 'network' && error.status !== 0)) {
        throw error;
      }
      await request('/rpc/delete_my_account', { method: 'POST', body: {} });
      data = { deleted: true, via: 'rpc' };
    }
    clearSession();
    return data;
  },
};

export { accessToken };

// 다른 탭/홈 화면 앱이 세션을 갱신하거나 로그아웃하면 메모리에 바로 반영한다.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event.key !== SESSION_KEY) return;
    const next = parseSession(event.newValue);
    session = next;
    scheduleRefresh(next);
  });
  // 이 탭이 잠들어 있는 동안 만료가 지나면, 열려 있는 채로 시간이 흘러도 끊기지 않게.
  if (storedSession()) scheduleRefresh(getSession());
}
