import test from 'node:test';
import assert from 'node:assert/strict';
import { inQuietHours } from '../lib/config.mjs';

// Eastern time; Nov 2 2026 is after the clocks go back (UTC-5).
const at = (iso) => Date.parse(iso);
test('quiet from 6 PM to 4 AM Eastern', () => {
  assert.equal(inQuietHours(at('2026-11-02T22:59:00Z')), false); // 5:59 PM
  assert.equal(inQuietHours(at('2026-11-02T23:00:00Z')), true);  // 6:00 PM
  assert.equal(inQuietHours(at('2026-11-03T05:00:00Z')), true);  // midnight
  assert.equal(inQuietHours(at('2026-11-03T08:59:00Z')), true);  // 3:59 AM
  assert.equal(inQuietHours(at('2026-11-03T09:00:00Z')), false); // 4:00 AM
  assert.equal(inQuietHours(at('2026-07-01T21:30:00Z')), false); // 5:30 PM in summer (UTC-4)
  assert.equal(inQuietHours(at('2026-07-01T22:00:00Z')), true);  // 6:00 PM in summer
});
