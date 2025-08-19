module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Transform ES modules for compatibility
  transformIgnorePatterns: [
    'node_modules/(?!(marked)/)',
  ],
  // Mock transformers.js for unit tests, allow real usage for integration tests
  moduleNameMapper: {
    '^@xenova/transformers$': '<rootDir>/tests/__mocks__/@xenova/transformers.ts',
    '^marked$': '<rootDir>/tests/__mocks__/marked.ts',
  },
};