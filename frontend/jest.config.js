// Pure-TS protocol tests (no React Native). Component tests would use jest-expo.
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/src/protocol/__tests__/**/*.test.ts',
    '**/src/ring/__tests__/**/*.test.ts',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
};
