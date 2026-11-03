/** Compact run detail for the result screen, using the selected mode's measure. */
export function resultDetail({ mode, attempt, distance, level, challengePercent }) {
  const prefix = `ATTEMPT ${String(attempt).padStart(2, '0')}`;
  return mode === 'challenge'
    ? `${prefix} · ${Math.floor(challengePercent)}% COMPLETE · LEVEL ${level || 1}`
    : `${prefix} · ${distance}m · LEVEL ${level || 1}`;
}
