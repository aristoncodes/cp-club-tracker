import { describe, expect, it } from 'vitest';
import { ticketErrors } from './push';

describe('ticketErrors', () => {
  it('reports real failures once each, but not unregistered phones or successes', () => {
    expect(
      ticketErrors([
        { status: 'ok' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', details: { error: 'InvalidCredentials' } },
        { status: 'error', details: { error: 'InvalidCredentials' } },
      ]),
    ).toEqual(['InvalidCredentials']);
  });
});
