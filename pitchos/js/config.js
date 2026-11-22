// JOKBAL.L web client configuration.
//
// Only the Supabase URL and the *anon* key belong here: both are shipped to the
// browser by design and every table is protected by RLS. Admin/secret keys and
// the database password must never appear in this directory (see
// docs/SECURITY_CHECKLIST.md).

export const SUPABASE_URL = 'https://zsmoaipnnsqiwvqninzw.supabase.co';

export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzbW9haXBubnNxaXd2cW5pbnp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyODM0NDYsImV4cCI6MjExMDg1OTQ0Nn0.oxM9y16vkSHwUjrguzm_68lW9__2cLARoN3HwZp66Js';

export const APP_VERSION = 'web-0.2.1';

export const SESSION_KEY = 'pitchos.web.session.v1';
export const PREFS_KEY = 'pitchos.web.prefs.v1';

// Where the manifest and static assets live. Relative so the same build works
// at the site root and under a GitHub Pages project path.
export const BASE = new URL('../', import.meta.url).pathname;
