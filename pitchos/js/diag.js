// Runtime error collector. Kept in the app (not only in dev) so a rendering or
// network failure leaves a readable trace for `window.__pitchosErrors` instead of
// disappearing into the console of a phone nobody can inspect.

const errors = [];

if (typeof window !== 'undefined' && !window.__pitchosErrors) {
  window.__pitchosErrors = errors;

  window.addEventListener('error', (event) => {
    errors.push({
      kind: 'error',
      message: String(event.message || 'unknown error'),
      source: event.filename || null,
      line: event.lineno || null,
      at: new Date().toISOString(),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    errors.push({
      kind: 'rejection',
      message: String(reason?.message || reason || 'unhandled rejection'),
      at: new Date().toISOString(),
    });
  });
}

export default errors;
