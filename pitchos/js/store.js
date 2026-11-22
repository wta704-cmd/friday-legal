// Shared in-memory state for one signed-in session: profile, teams, the
// selected team, its members and its matches. Views read from here and call the
// loaders when something changed.

import { profiles, teams as teamsApi, matches as matchesApi } from './api.js';
import { readPrefs, writePrefs } from './ui.js';

export const state = {
  profile: null,
  teams: [],
  teamId: null,
  members: [],
  matches: [],
  config: null,
};

export function reset() {
  state.profile = null;
  state.teams = [];
  state.teamId = null;
  state.members = [];
  state.matches = [];
}

export async function loadProfile() {
  state.profile = await profiles.mine();
  return state.profile;
}

export async function loadTeams() {
  state.teams = (await teamsApi.list()) || [];
  const prefs = readPrefs();
  const stored = state.teams.some((team) => team.id === prefs.teamId) ? prefs.teamId : null;
  state.teamId = stored || state.teams[0]?.id || null;
  if (state.teamId && state.teamId !== prefs.teamId) writePrefs({ teamId: state.teamId });
  return state.teams;
}

export function selectTeam(teamId) {
  if (state.teamId === teamId) return;
  state.teamId = teamId;
  state.members = [];
  state.matches = [];
  writePrefs({ teamId });
}

export function currentTeam() {
  return state.teams.find((team) => team.id === state.teamId) || null;
}

export function myMember() {
  const uid = state.profile?.id;
  return state.members.find((member) => member.user_id === uid) || null;
}

export function myRole() {
  return myMember()?.role || null;
}

export function canManage() {
  const role = myRole();
  return role === 'owner' || role === 'manager';
}

export async function loadMembers(teamId = state.teamId) {
  if (!teamId) {
    state.members = [];
    return state.members;
  }
  state.members = (await teamsApi.members(teamId)) || [];
  return state.members;
}

export async function loadMatches(teamId = state.teamId) {
  if (!teamId) {
    state.matches = [];
    return state.matches;
  }
  state.matches = (await matchesApi.list(teamId)) || [];
  return state.matches;
}

export function memberName(userId) {
  return state.members.find((member) => member.user_id === userId)?.display_name || '팀원';
}

export function memberMap() {
  return new Map(state.members.map((member) => [member.user_id, member]));
}
