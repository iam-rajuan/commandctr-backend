import { describe, expect, it } from 'vitest';

import { healthService } from './health.service';

describe('healthService', () => {
  it('returns the Twinstr health payload shape', () => {
    const result = healthService.getHealthStatus();

    expect(result.service).toBe('Twinstr Backend');
    expect(result.status).toBe('ok');
    expect(typeof result.timestamp).toBe('string');
    expect(typeof result.uptime).toBe('number');
  });
});
