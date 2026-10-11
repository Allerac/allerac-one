/** @jest-environment node */

import { isExecutorEnabled } from '@/lib/executor-enabled';

describe('isExecutorEnabled', () => {
  it('is enabled when EXECUTOR_ENABLED is unset (backward compatible default)', () => {
    expect(isExecutorEnabled({})).toBe(true);
    expect(isExecutorEnabled({ EXECUTOR_ENABLED: '' })).toBe(true);
  });

  it.each(['false', 'FALSE', ' 0 ', 'no', 'off'])('is disabled for EXECUTOR_ENABLED=%p', value => {
    expect(isExecutorEnabled({ EXECUTOR_ENABLED: value })).toBe(false);
  });

  it.each(['true', '1', 'yes', 'on'])('stays enabled for EXECUTOR_ENABLED=%p', value => {
    expect(isExecutorEnabled({ EXECUTOR_ENABLED: value })).toBe(true);
  });
});
