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

let session = null;

export function getSession() {
  if (session) return session;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    session = raw ? JSON.parse(raw) : null;
  } catch {
    session = null;
  }
  return session;
}

function saveSession(next) {
  session = next;
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode: the in-memory session still works for this tab */
  }
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

let refreshPromise = null;

export async function refreshSession() {
  const current = getSession();
  if (!current?.refresh_token) {
    clearSession();
    throw new ApiError('로그인 정보가 만료되었습니다. 다시 로그인해 주세요.', {
      status: 401,
      code: 'session_expired',
    });
  }
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { ok, status, data } = await send(
      buildUrl('auth', '/token?grant_type=refresh_token'),
      { method: 'POST', body: { refresh_token: current.refresh_token } },
    );
    if (!ok || !data?.access_token) {
      clearSession();
      throw new ApiError('로그인 정보가 만료되었습니다. 다시 로그인해 주세요.', {
        status: 401,
        code: 'session_expired',
      });
    }
    return saveSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token || current.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      user: data.user
        ? { id: data.user.id, email: data.user.email }
        : current.user,
    });
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
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

function adopt(entry) {
  return saveSession({
    access_token: entry.access_token,
    refresh_token: entry.refresh_token,
    expires_at: Date.now() + (Number(entry.expires_in) || 3600) * 1000,
    user: entry.user ? { id: entry.user.id, email: entry.user.email } : null,
  });
}

export const auth = {
  async signIn(email, password) {
    const { ok, status, data } = await send(buildUrl('auth', '/token?grant_type=password'), {
      method: 'POST',
      body: { email: email.trim(), password },
    });
    if (!ok || !data?.access_token) throw toError(status, data);
    return adopt(data);
  },

  /** @returns {{ needsConfirm: boolean, email: string }} */
  async signUp(email, password, displayName) {
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
      adopt(data);
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
    const data = await request('/user', { base: 'auth' });
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
    const data = await request('/delete-account', { method: 'POST', base: 'functions', body: {} });
    clearSession();
    return data;
  },
};

export { accessToken };
