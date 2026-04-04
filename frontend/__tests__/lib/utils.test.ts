import { formatBytes, formatDuration } from '@/lib/utils';

describe('utility helpers', () => {
  it('formats byte values into human readable strings', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
  });

  it('formats durations as mm:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(62)).toBe('1:02');
    expect(formatDuration(125)).toBe('2:05');
  });
});
