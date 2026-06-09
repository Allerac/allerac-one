const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  testPathIgnorePatterns: [
    '/__tests__/__mocks__/',
    '/__tests__/setup.ts',
    '/\\.claude/worktrees/',
    '/\\.next/',
    '/e2e/',
    '/workspace/projects/',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/.claude/worktrees/',
    '<rootDir>/.next/',
    '<rootDir>/workspace/projects/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-syntax-highlighter|remark-gfm)/)',
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
