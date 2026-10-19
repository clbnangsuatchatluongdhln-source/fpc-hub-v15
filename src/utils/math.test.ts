import { describe, it, expect } from 'vitest';
import { clamp } from './math';

describe('clamp', () => {
  it('trả về giá trị trong khoảng', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('kẹp về min', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });
  it('kẹp về max', () => {
    expect(clamp(99, 0, 10)).toBe(10);
  });
});
