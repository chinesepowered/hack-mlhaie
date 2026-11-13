import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSoaking, soakEndsAt, type Booking } from '../src/onsen.ts';

const booking: Booking = { guest: 'Capy', startMinute: 30, durationMinutes: 45 };

test('soakEndsAt adds the duration to the start minute', () => {
  assert.equal(soakEndsAt(booking), 75);
});

test('isSoaking is false before the soak starts', () => {
  assert.equal(isSoaking(booking, 29), false);
});

test('isSoaking is true from the start minute onward', () => {
  assert.equal(isSoaking(booking, 30), true);
  assert.equal(isSoaking(booking, 60), true);
});
