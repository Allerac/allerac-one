// Global mock for database client
// Used by all services that depend on the postgres pool

jest.mock('@/app/clients/db', () => {
  const mockQuery = jest.fn();
  const mockConnect = jest.fn();
  const mockEnd = jest.fn();

  return {
    __esModule: true,
    default: {
      query: mockQuery,
      connect: mockConnect,
      end: mockEnd,
    },
    mockQuery,
    mockConnect,
    mockEnd,
  };
});

export const getDbMock = () => {
  const db = require('@/app/clients/db').default;
  return {
    query: db.query,
    connect: db.connect,
    end: db.end,
  };
};

export const resetDbMocks = () => {
  const db = require('@/app/clients/db').default;
  db.query.mockClear();
  db.connect.mockClear();
  db.end.mockClear();
};
