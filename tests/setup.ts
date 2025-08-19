// Jest setup file for test environment
import { jest } from '@jest/globals';

// Set up test timeout
jest.setTimeout(30000);

// Mock console methods in tests unless specifically testing them
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});