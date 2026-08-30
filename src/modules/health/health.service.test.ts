import { describe, expect, it } from 'vitest';

import { healthService } from './health.service';

describe('healthService', () => {
  it('returns the CommandCtr health payload shape', () => {
    const result = healthService.getHealthStatus();

    expect(result.service).toBe('CommandCtr Backend');
    expect(result.status).toBe('ok');
    expect(typeof result.timestamp).toBe('string');
    expect(typeof result.uptime).toBe('number');
  });
});
