export function formatDuration(value, unit = 1) {
  if (!['number','string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) return 'Unbekannt';
  const milliseconds = Number(value) * unit;
  const seconds = Math.floor(Math.abs(milliseconds) / 1000);
  const parts = [Math.floor(seconds / 3600) && `${Math.floor(seconds / 3600)} Std.`, Math.floor(seconds % 3600 / 60) && `${Math.floor(seconds % 3600 / 60)} Min.`, seconds % 60 && `${seconds % 60} Sek.`].filter(Boolean);
  return `${milliseconds < 0 ? '−' : ''}${parts.join(' ') || (milliseconds ? '< 1 Sek.' : '0 Sek.')}`;
}

export function slaSnapshot(sla) {
  let payload = sla;
  if (typeof sla.timeline === 'string') {
    try { payload = JSON.parse(sla.timeline) || sla; } catch { payload = sla; }
  }
  const complete = Array.isArray(payload.completeSLAData) ? payload.completeSLAData.at(-1) : null;
  const ongoing = payload.ongoingSLAData || null;
  const raw = String(sla.last_cycle_state || sla.last_timeline_cycle_state || (complete ? 'completed' : ongoing ? 'running' : '')).trim().toLowerCase();
  const states = {running:'running',ongoing:'running',paused:'paused',completed:'completed','not started':'pending',not_started:'pending',breached:'breached'};
  const state = Object.hasOwn(states,raw) ? states[raw] : 'unknown';
  const result = complete ? complete.succeeded : sla.last_complete_cycle_failed;
  const outcome = complete
    ? result === true || String(result).toLowerCase() === 'true' ? 'met' : result === false || String(result).toLowerCase() === 'false' ? 'breached' : 'unknown'
    : result === true || String(result).toLowerCase() === 'true' ? 'breached' : result === false || String(result).toLowerCase() === 'false' ? 'met' : 'unknown';
  return {state, outcome, complete, ongoing, startTime: complete?.startTime, stopTime: complete?.stopTime};
}
