/**
 * DocumentUpload Component
 *
 * Provides UI for uploading and managing documents in the knowledge base.
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import * as docActions from '@/app/actions/documents';

interface Document {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  uploaded_at: string;
  status: 'processing' | 'completed' | 'failed';
  error_message?: string;
}

type DocumentDetails = Awaited<ReturnType<typeof docActions.getDocumentDetails>>;

interface DocumentUploadProps {
  /** @deprecated Embeddings are local; retained temporarily for caller compatibility. */
  githubToken?: string;
  userId: string;
  isDarkMode: boolean;
  onDocumentsChange?: () => void;
  domainSlug?: string | null;
}

const POLLING_INTERVAL = 3000;

export default function DocumentUpload({ userId, isDarkMode, onDocumentsChange, domainSlug }: DocumentUploadProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Fetches all documents for the current user from the database
   */
  const loadDocuments = useCallback(async (): Promise<Document[]> => {
    try {
      if (!userId) return [];
      const data = await docActions.getAllDocuments(domainSlug);
      setDocuments(data || []);
      return data || [];
    } catch (error) {
      console.error('Error loading documents:', error);
      return [];
    }
  }, [userId, domainSlug]);

  /**
   * Starts polling for document status updates
   */
  const startPolling = useCallback(() => {
    // Clear any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(async () => {
      const docs = await loadDocuments();
      const hasProcessing = docs.some((doc: Document) => doc.status === 'processing');

      // Stop polling if no documents are processing
      if (!hasProcessing && pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;

        // Notify parent component that processing is complete
        if (onDocumentsChange) {
          onDocumentsChange();
        }
      }
    }, POLLING_INTERVAL);
  }, [loadDocuments, onDocumentsChange]);

  // Load documents on component mount
  useEffect(() => {
    loadDocuments().then((docs) => {
      // Start polling if there are processing documents
      if (docs && docs.some((doc: Document) => doc.status === 'processing')) {
        startPolling();
      }
    });

    // Cleanup polling on unmount
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [loadDocuments, startPolling]);

  /**
   * Handles file upload and processing
   */
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    const fileName = file.name.toLowerCase();
    const isValidType = fileName.endsWith('.txt') || fileName.endsWith('.pdf') || fileName.endsWith('.md');

    if (!isValidType) {
      alert('Currently only .txt, .pdf and .md files are supported');
      return;
    }

    setIsUploading(true);
    setUploadProgress('Uploading file...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Use async upload - returns immediately while processing continues in background
      await docActions.uploadDocument(formData, domainSlug);

      setUploadProgress('Document uploaded! Processing in background...');

      // Reload documents list immediately to show the new document
      await loadDocuments();

      // Start polling to track processing status
      startPolling();

      // Notify parent component
      if (onDocumentsChange) {
        onDocumentsChange();
      }

      // Clear progress after a delay
      setTimeout(() => {
        setUploadProgress('');
      }, 2000);
    } catch (error) {
      console.error('Error uploading document:', error);
      setUploadProgress('Error: ' + (error as Error).message);

      // Reload documents in case the record was created before the error
      await loadDocuments();

      setTimeout(() => {
        setUploadProgress('');
      }, 5000);
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Handles file selection via input element
   */
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset input so same file can be selected again
    event.target.value = '';
  };

  /**
   * Handles drag and drop events
   */
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  /**
   * Deletes a document from the database
   */
  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      await docActions.deleteDocument(documentId);
      await loadDocuments();

      if (onDocumentsChange) {
        onDocumentsChange();
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Failed to delete document');
    }
  };

  const openDocument = useCallback(async (documentId: string) => {
    setDetailsLoading(true);
    setDetailsError('');
    try {
      setSelectedDocument(await docActions.getDocumentDetails(documentId));
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : 'Failed to load document');
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    const documentId = new URLSearchParams(window.location.search).get('document');
    if (documentId) void openDocument(documentId);
  }, [openDocument]);

  /**
   * Formats file size for display
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  /**
   * Formats date for display
   */
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
          ${isDragging
            ? (isDarkMode ? 'border-brand-400 bg-brand-900/20' : 'border-brand-500 bg-brand-50')
            : (isDarkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400')
          }
          ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.pdf,.md,.jpg,.jpeg,.png,.gif,.webp"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />

        <svg
          className={`mx-auto h-12 w-12 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
          stroke="currentColor"
          fill="none"
          viewBox="0 0 48 48"
        >
          <path
            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <p className={`mt-2 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          {isUploading ? uploadProgress : 'Drag and drop a file here, or click to select'}
        </p>
        <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Supported: .txt, .pdf, .md, .jpg, .png, .gif, .webp
        </p>
      </div>

      {/* Documents List */}
      {documents.length > 0 && (
        <div className="space-y-2">
          <h3 className={`text-sm font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-700'}`}>Uploaded Documents</h3>
          <div className="space-y-1">
            {documents.map((doc) => (
              <div
                key={doc.id}
                role="button"
                tabIndex={0}
                onClick={() => openDocument(doc.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') openDocument(doc.id);
                }}
                className={`flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer ${isDarkMode ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'}`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {doc.filename}
                  </p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {formatFileSize(doc.file_size)} • {formatDate(doc.uploaded_at)}
                  </p>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {/* Status Indicator */}
                  {doc.status === 'processing' && (
                    <span className="flex items-center gap-1 text-xs text-brand-600">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processing
                    </span>
                  )}
                  {doc.status === 'completed' && (
                    <span className="text-xs text-green-600">✓ Ready</span>
                  )}
                  {doc.status === 'failed' && (
                    <span className="text-xs text-red-600" title={doc.error_message}>
                      ✗ Failed
                    </span>
                  )}

                  {/* Delete Button */}
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteDocument(doc.id);
                    }}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete document"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(detailsLoading || detailsError) && (
        <p className={`text-sm ${detailsError ? 'text-red-500' : isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {detailsError || 'Loading document…'}
        </p>
      )}

      {selectedDocument && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Document: ${selectedDocument.filename}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedDocument(null)}
        >
          <section
            className={`max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border p-5 shadow-2xl ${
              isDarkMode ? 'border-gray-700 bg-gray-900 text-gray-100' : 'border-gray-200 bg-white text-gray-900'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{selectedDocument.filename}</h2>
                <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {selectedDocument.file_type} · {formatFileSize(selectedDocument.file_size)}
                  {' · '}{selectedDocument.chunks.length} chunk{selectedDocument.chunks.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                onClick={() => setSelectedDocument(null)}
                className={`rounded px-2 py-1 text-sm ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                aria-label="Close document"
              >
                ✕
              </button>
            </div>

            {selectedDocument.crawler && (
              <div className={`mt-4 rounded-lg border p-3 text-sm ${
                isDarkMode ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-indigo-200 bg-indigo-50'
              }`}>
                <p><strong>Crawler source:</strong> {selectedDocument.crawler.source_id}</p>
                <p><strong>External ID:</strong> {selectedDocument.crawler.external_id}</p>
                <a
                  href={selectedDocument.crawler.canonical_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-indigo-500 hover:underline"
                >
                  Open original source ↗
                </a>
              </div>
            )}

            <div className="mt-5 space-y-3">
              {selectedDocument.chunks.length === 0 ? (
                <p className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>No chunks stored yet.</p>
              ) : selectedDocument.chunks.map((chunk) => (
                <article
                  key={chunk.id}
                  className={`rounded-lg border p-4 ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}
                >
                  <header className={`mb-2 flex justify-between text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span>Chunk {chunk.chunk_index + 1}</span>
                    <span>{chunk.has_embedding ? '✓ Embedding stored' : 'No embedding'}</span>
                  </header>
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">{chunk.content}</pre>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
