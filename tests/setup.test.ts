/**
 * Basic test to verify Jest setup is working
 */

describe('Jest Setup', () => {
  it('should run tests correctly', () => {
    expect(true).toBe(true);
  });

  it('should have access to basic Node.js APIs', () => {
    expect(typeof process).toBe('object');
    expect(typeof console).toBe('object');
  });
});