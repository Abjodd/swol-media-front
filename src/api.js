// Thin fetch wrapper. Every request carries this tab's session token (see session.js),
// so different tabs can be signed in as different people.
import { API_BASE as BASE, session, withSession } from './session.js';

async function request(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (session.token()) headers.Authorization = `Bearer ${session.token()}`;
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // the request never got an answer: server asleep/down, offline, or this website isn't allowed by the API (CORS)
    const err = new Error('Can’t reach the Swol Media server right now. If it was idle it may be waking up — try again in a minute.');
    err.status = 0;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  // signed in, but the server no longer accepts this sign-in (12 hours passed, password reset, account disabled)
  if (res.status === 401 && headers.Authorization && path !== '/auth/me') session.expire();
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  login: async (email, password) => {
    const d = await request('/auth/login', { method: 'POST', body: { email, password } });
    session.set(d.token);
    return d;
  },
  me: async () => {
    if (!session.token()) throw Object.assign(new Error('Not signed in'), { status: 401 });
    try {
      return await request('/auth/me');
    } catch (e) {
      if (e.status === 401) session.clear(); // expired or revoked — forget it so the tab can sign in again
      throw e;
    }
  },
  logout: async () => {
    await request('/auth/logout', { method: 'POST' }).catch(() => {});
    session.clear();
  },

  // own profile
  updateMe: (payload) => request('/auth/me', { method: 'PATCH', body: payload }),
  uploadAvatar: (image) => request('/auth/me/avatar', { method: 'PUT', body: { image } }),
  removeAvatar: () => request('/auth/me/avatar', { method: 'DELETE' }),
  changePassword: async (currentPassword, newPassword) => {
    const d = await request('/auth/me/password', { method: 'POST', body: { currentPassword, newPassword } });
    if (d.token) session.set(d.token); // this tab stays signed in; other sessions of this account end
    return d;
  },

  listUsers: (role) => request(`/users${role ? `?role=${role}` : ''}`),
  createUser: (payload) => request('/users', { method: 'POST', body: payload }),
  resetPassword: (id, password) =>
    request(`/users/${id}/reset-password`, { method: 'POST', body: password ? { password } : undefined }),
  getUserPassword: (id) => request(`/users/${id}/password`),
  updateUser: (id, payload) => request(`/users/${id}`, { method: 'PATCH', body: payload }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  // companies
  listClients: () => request('/clients'),
  getClient: (id) => request(`/clients/${id}`),
  createClient: (data) => request('/clients', { method: 'POST', body: data }),
  updateClient: (id, data) => request(`/clients/${id}`, { method: 'PATCH', body: data }),
  listVendors: () => request('/vendors'),
  getVendor: (id) => request(`/vendors/${id}`),
  createVendor: (data) => request('/vendors', { method: 'POST', body: data }),
  updateVendor: (id, data) => request(`/vendors/${id}`, { method: 'PATCH', body: data }),

  // campaigns
  overview: (campaign) => request(`/overview${campaign && campaign !== 'all' ? `?campaign=${campaign}` : ''}`),
  listCampaigns: (params = {}) => request(`/campaigns?${new URLSearchParams(typeof params === 'string' ? { status: params } : params)}`),
  getCampaign: (id) => request(`/campaigns/${id}`),
  createCampaign: (data) => request('/campaigns', { method: 'POST', body: data }),
  updateCampaign: (id, data) => request(`/campaigns/${id}`, { method: 'PATCH', body: data }),
  deleteCampaign: (id) => request(`/campaigns/${id}`, { method: 'DELETE' }),
  uploadDocument: (id, kind, filename, data) =>
    request(`/campaigns/${id}/documents`, { method: 'POST', body: { kind, filename, data } }),
  deleteDocument: (id, docId) => request(`/campaigns/${id}/documents/${docId}`, { method: 'DELETE' }),
  // client overview: their campaigns + client-safe numbers for each shortlisted creator
  clientInsights: () => request('/campaigns/insights'),
  // everything about a campaign at every stage, as one CSV (internal team only)
  exportUrl: (id) => withSession(`${BASE}/api/campaigns/${id}/export.csv`),
  documentUrl: (id, docId, download) => withSession(`${BASE}/api/campaigns/${id}/documents/${docId}${download ? '?download=1' : ''}`),
  assignVendor: (id, data) => request(`/campaigns/${id}/vendors`, { method: 'POST', body: data }),
  updateAssignment: (id, aid, data) => request(`/campaigns/${id}/vendors/${aid}`, { method: 'PATCH', body: data }),
  removeAssignment: (id, aid) => request(`/campaigns/${id}/vendors/${aid}`, { method: 'DELETE' }),
  // creators on a campaign (pipeline)
  listCampaignCreators: (id) => request(`/campaigns/${id}/creators`),
  addCampaignCreators: (id, data) => request(`/campaigns/${id}/creators`, { method: 'POST', body: data }),
  moveCampaignCreators: (id, ids, status, note) => request(`/campaigns/${id}/creators/status`, { method: 'PATCH', body: { ids, status, note } }),
  setCreatorCost: (id, sid, data) => request(`/campaigns/${id}/creators/${sid}/cost`, { method: 'PATCH', body: data }),
  removeCampaignCreator: (id, sid) => request(`/campaigns/${id}/creators/${sid}`, { method: 'DELETE' }),
  // creator database
  listCreators: (params = {}) => request(`/creators?${new URLSearchParams(params)}`),
  fetchCreatorInstagram: (id) => request(`/creators/${id}/instagram`, { method: 'POST' }),
  instagramStatus: () => request('/creators/instagram/status'),
  updateCreator: (id, data) => request(`/creators/${id}`, { method: 'PATCH', body: data }),
};
