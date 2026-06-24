/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { DocumentService } from '@/app/services/rag/document.service';
import { GET as listDocuments, POST as uploadDocument } from '@/app/api/v1/documents/route';
import { DELETE as deleteDocument } from '@/app/api/v1/documents/[id]/route';

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    requireCurrentUser: jest.fn(),
    assertDomainAccess: jest.fn(),
  };
});

jest.mock('@/app/services/rag/document.service', () => ({
  DocumentService: jest.fn(),
}));

jest.mock('@/app/services/rag/embedding.service', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/app/services/user/user-settings.service', () => ({
  UserSettingsService: jest.fn().mockImplementation(() => ({
    loadUserSettings: jest.fn().mockResolvedValue(null),
  })),
}));

jest.mock('@/app/services/system/system-settings.service', () => ({
  SystemSettingsService: jest.fn().mockImplementation(() => ({
    loadAll: jest.fn().mockResolvedValue({ github_token: null }),
  })),
}));

const MockDocumentService = DocumentService as jest.MockedClass<typeof DocumentService>;
const mockRequireCurrentUser = jest.mocked(requireCurrentUser);

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const doc = {
  id: 'doc-id',
  filename: 'report.pdf',
  file_type: 'application/pdf',
  file_size: 1024,
  domain_slug: null,
  status: 'completed',
  error_message: null,
  uploaded_at: new Date('2026-06-25T10:00:00.000Z'),
};

function routeParams(id = 'doc-id') {
  return { params: Promise.resolve({ id }) };
}

function multipartRequest(url: string, file: File, domainSlug?: string): Request {
  const formData = new FormData();
  formData.append('file', file);
  if (domainSlug) formData.append('domainSlug', domainSlug);
  return new Request(url, { method: 'POST', body: formData });
}

function mockDocInstance(overrides: Partial<{
  getAllDocuments: jest.Mock;
  createDocumentRecord: jest.Mock;
  extractTextFromFile: jest.Mock;
  processDocumentContent: jest.Mock;
  deleteDocument: jest.Mock;
}> = {}) {
  const instance = {
    getAllDocuments: jest.fn().mockResolvedValue([]),
    createDocumentRecord: jest.fn(),
    extractTextFromFile: jest.fn(),
    processDocumentContent: jest.fn().mockResolvedValue(undefined),
    deleteDocument: jest.fn(),
    ...overrides,
  };
  MockDocumentService.mockImplementation(() => instance as any);
  return instance;
}

describe('Control API v1 documents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());
    mockDocInstance();

    const response = await listDocuments(new Request('http://localhost/api/v1/documents'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'unauthorized', message: 'Unauthorized' } });
  });

  it('lists documents owned by the current user', async () => {
    const instance = mockDocInstance({
      getAllDocuments: jest.fn().mockResolvedValue([doc]),
    });

    const response = await listDocuments(new Request('http://localhost/api/v1/documents'));

    expect(response.status).toBe(200);
    expect(instance.getAllDocuments).toHaveBeenCalledWith(user.id, undefined);
    const body = await response.json();
    expect(body.data.documents[0]).toMatchObject({
      id: 'doc-id',
      filename: 'report.pdf',
      fileType: 'application/pdf',
      fileSize: 1024,
      status: 'completed',
    });
  });

  it('filters documents by domainSlug', async () => {
    const instance = mockDocInstance({
      getAllDocuments: jest.fn().mockResolvedValue([]),
    });

    await listDocuments(new Request('http://localhost/api/v1/documents?domainSlug=notes'));

    expect(instance.getAllDocuments).toHaveBeenCalledWith(user.id, 'notes');
  });

  it('applies limit to document list', async () => {
    const docs = Array.from({ length: 10 }, (_, i) => ({ ...doc, id: `doc-${i}` }));
    const instance = mockDocInstance({
      getAllDocuments: jest.fn().mockResolvedValue(docs),
    });

    const response = await listDocuments(new Request('http://localhost/api/v1/documents?limit=3'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.documents).toHaveLength(3);
  });

  it('returns 400 for missing file on upload', async () => {
    mockDocInstance();
    const formData = new FormData();
    const request = new Request('http://localhost/api/v1/documents', {
      method: 'POST',
      body: formData,
    });

    const response = await uploadDocument(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('uploads document and fires background processing', async () => {
    const instance = mockDocInstance({
      createDocumentRecord: jest.fn().mockResolvedValue('doc-id'),
      extractTextFromFile: jest.fn().mockResolvedValue('text content'),
      processDocumentContent: jest.fn().mockResolvedValue(undefined),
      getAllDocuments: jest.fn().mockResolvedValue([doc]),
    });

    const file = new File(['content'], 'report.pdf', { type: 'application/pdf' });
    const request = multipartRequest('http://localhost/api/v1/documents', file);

    const response = await uploadDocument(request);

    expect(response.status).toBe(201);
    expect(instance.createDocumentRecord).toHaveBeenCalledWith(file, user.id, null);
    expect(instance.extractTextFromFile).toHaveBeenCalledWith(file);
    expect(instance.processDocumentContent).toHaveBeenCalledWith('doc-id', 'text content');
    const body = await response.json();
    expect(body.data.document).toMatchObject({ id: 'doc-id', filename: 'report.pdf' });
  });

  it('deletes a document owned by the current user', async () => {
    const instance = mockDocInstance({
      deleteDocument: jest.fn().mockResolvedValue(undefined),
    });

    const response = await deleteDocument(
      new Request('http://localhost/api/v1/documents/doc-id', { method: 'DELETE' }),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(instance.deleteDocument).toHaveBeenCalledWith('doc-id', user.id);
    expect(await response.json()).toEqual({ data: { deleted: true } });
  });

  it('returns 404 when deleting a missing document', async () => {
    mockDocInstance({
      deleteDocument: jest.fn().mockRejectedValue(new Error('Document not found')),
    });

    const response = await deleteDocument(
      new Request('http://localhost/api/v1/documents/missing', { method: 'DELETE' }),
      routeParams('missing'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});
