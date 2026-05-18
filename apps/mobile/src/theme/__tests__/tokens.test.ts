import { tokens } from '../tokens';

describe('theme tokens', () => {
  it('exposes the eight required color tokens', () => {
    expect(tokens.color.bgBase).toBe('#0a1220');
    expect(tokens.color.bgElev).toBe('#0f1d33');
    expect(tokens.color.bgDeep).toBe('#103952');
    expect(tokens.color.accent).toBe('#22d3ee');
    expect(tokens.color.accent2).toBe('#a5f3fc');
    expect(tokens.color.text).toBe('#f0f9ff');
    expect(tokens.color.text2).toBe('#94a3b8');
    expect(tokens.color.text3).toBe('#64748b');
    expect(tokens.color.success).toBe('#22c55e');
    expect(tokens.color.warning).toBe('#facc15');
    expect(tokens.color.danger).toBe('#ef4444');
  });

  it('spacing is 4-based', () => {
    expect(tokens.space[1]).toBe(4);
    expect(tokens.space[2]).toBe(8);
    expect(tokens.space[3]).toBe(12);
    expect(tokens.space[4]).toBe(16);
    expect(tokens.space[6]).toBe(24);
    expect(tokens.space[8]).toBe(32);
  });

  it('typography exposes the documented sizes', () => {
    expect(tokens.type.display.size).toBe(30);
    expect(tokens.type.heading.size).toBe(18);
    expect(tokens.type.body.size).toBe(15);
    expect(tokens.type.caption.size).toBe(11);
    expect(tokens.type.caption.letterSpacing).toBe(0.12);
  });
});
