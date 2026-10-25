import { describe, it, expect } from 'vitest';
import { telemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  it('correctly reports Node.js runtime version matching process.version', () => {
    const data = telemetryService.getTelemetry();
    expect(data.nodeVersion).toBe(process.version);
    expect(data.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it('formats uptime seconds correctly', () => {
    expect(telemetryService.formatUptime(45)).toBe('45s');
    expect(telemetryService.formatUptime(125)).toBe('2m 5s');
    expect(telemetryService.formatUptime(3665)).toBe('1h 1m 5s');
    expect(telemetryService.formatUptime(90065)).toBe('1d 1h 1m');
  });

  it('records requests in rolling 60-second ring buffer', () => {
    const initialReqs = telemetryService.getRequestsPerMinute();
    telemetryService.recordRequest();
    telemetryService.recordRequest();
    telemetryService.recordRequest();
    const afterReqs = telemetryService.getRequestsPerMinute();
    expect(afterReqs).toBe(initialReqs + 3);
  });

  it('gathers valid memory and CPU metrics without throwing', () => {
    const data = telemetryService.getTelemetry();
    expect(data.memory.rssMb).toBeGreaterThan(0);
    expect(data.memory.heapTotalMb).toBeGreaterThan(0);
    expect(data.memory.heapUsedMb).toBeGreaterThan(0);
    expect(data.cpu.cores).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.cpu.loadAvg)).toBe(true);
    expect(data.eventLoop.lagMs).toBeGreaterThanOrEqual(0);
    expect(data.history.cpu.length).toBeGreaterThan(0);
    expect(data.history.ram.length).toBeGreaterThan(0);
  });
});
