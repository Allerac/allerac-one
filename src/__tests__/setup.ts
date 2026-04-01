// Jest setup file - runs before each test
import '@testing-library/jest-dom';

// Clear all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});
