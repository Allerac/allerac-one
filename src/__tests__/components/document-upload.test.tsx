import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentUpload from '@/app/components/documents/DocumentUpload';
import * as docActions from '@/app/actions/documents';

jest.mock('@/app/actions/documents', () => ({
  getAllDocuments: jest.fn(),
  uploadDocument: jest.fn(),
  deleteDocument: jest.fn(),
  getDocumentDetails: jest.fn(),
}));

const mockGetAllDocuments = jest.mocked(docActions.getAllDocuments);
const mockGetDocumentDetails = jest.mocked(docActions.getDocumentDetails);

describe('DocumentUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads local-embedding documents without a GitHub token', async () => {
    mockGetAllDocuments.mockResolvedValue([{
      id: 'document-id',
      filename: 'DUIMP - Integration smoke test',
      file_type: 'text/plain',
      file_size: 38,
      uploaded_at: '2026-08-05T20:19:13.804Z',
      status: 'completed',
      error_message: null,
    }] as any);

    render(
      <DocumentUpload
        githubToken=""
        userId="user-id"
        isDarkMode
        domainSlug="memory"
      />,
    );

    expect(await screen.findByText('DUIMP - Integration smoke test')).toBeInTheDocument();
    expect(screen.getByText('✓ Ready')).toBeInTheDocument();
    await waitFor(() => expect(mockGetAllDocuments).toHaveBeenCalledWith('memory'));
  });

  it('opens crawler metadata, chunks, and embedding state', async () => {
    mockGetAllDocuments.mockResolvedValue([{
      id: 'document-id', filename: 'DUIMP', file_type: 'text/plain', file_size: 38,
      uploaded_at: '2026-08-05T20:19:13.804Z', status: 'completed',
    }] as any);
    mockGetDocumentDetails.mockResolvedValue({
      id: 'document-id', filename: 'DUIMP', file_type: 'text/plain', file_size: 38,
      domain_slug: 'memory', status: 'completed', error_message: null, metadata: {},
      uploaded_at: '2026-08-05T20:19:13.804Z',
      crawler: {
        source_id: 'receita-federal-duimp', external_id: 'page-1',
        canonical_url: 'https://www.gov.br/example', attribution: {},
        retrieved_at: '2026-08-05T20:19:13.804Z',
      },
      chunks: [{
        id: 'chunk-id', chunk_index: 0, content: 'DUIMP integration smoke test document.',
        token_count: 10, metadata: {}, has_embedding: true,
      }],
    });

    render(<DocumentUpload userId="user-id" isDarkMode domainSlug="memory" />);
    fireEvent.click(await screen.findByText('DUIMP'));

    expect(await screen.findByRole('dialog', { name: 'Document: DUIMP' })).toBeInTheDocument();
    expect(screen.getByText('DUIMP integration smoke test document.')).toBeInTheDocument();
    expect(screen.getByText('✓ Embedding stored')).toBeInTheDocument();
    expect(screen.getByText('receita-federal-duimp')).toBeInTheDocument();
  });
});
