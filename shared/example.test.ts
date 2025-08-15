import { describe, expect, it } from 'vitest';

function add(a: number, b: number) {
  return a + b;
}

describe('add', () => {
  it('adds two numbers', () => {
    expect(add(1, 1)).toBe(2);
  });
});
