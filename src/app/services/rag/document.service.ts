/**
 * DocumentService
 * 
 * Handles document processing including:
 * - Text extraction from various file formats
 * - Splitting text into manageable chunks
 * - Managing document metadata
 */

import pool from '@/app/clients/db';
import { EmbeddingService } from './embedding.service';

// Configuration for text chunking
const CHUNK_SIZE = 1000; // Characters per chunk
const CHUNK_OVERLAP = 200; // Overlap between chunks to maintain context

export interface DocumentMetadata {
  filename: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
}

export interface DocumentChunk {
  content: string;
  chunkIndex: number;
  metadata: {
    characterStart: number;
    characterEnd: number;
  };
}

export interface ProcessedDocument {
  documentId: string;
  chunks: DocumentChunk[];
}

export class DocumentService {
  private embeddingService: EmbeddingService;

  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
  }

  /**
   * Extracts text content from a file.
   * Supports plain text and PDF files.
   * 
   * @param file - The uploaded file
   * @returns Promise with the extracted text
   */
  async extractTextFromFile(file: File): Promise<string> {
    const fileType = file.type;
    const fileName = file.name.toLowerCase();

    // Handle plain text files
    if (fileType === 'text/plain' || fileName.endsWith('.txt')) {
      return await this.extractTextFromPlainText(file);
    }

    // Handle PDF files
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return await this.extractTextFromPDF(file);
    }

    // Unsupported format
    throw new Error(`Unsupported file type: ${fileType}. Currently supports .txt and .pdf files.`);
  }

  /**
   * Extracts text from a plain text file.
   * Uses file.text() which works in both browser and Node.js environments.
   */
  private async extractTextFromPlainText(file: File): Promise<string> {
    try {
      // file.text() is a Web API that works in Node.js 18+
      return await file.text();
    } catch (error) {
      console.error('Error reading text file:', error);
      throw new Error(`Failed to read text file: ${(error as Error).message}`);
    }
  }

  /**
   * Extracts text from a PDF file using pdf-parse library (Node.js compatible).
   */
  private async extractTextFromPDF(file: File): Promise<string> {
    try {
      // Get file content as Buffer (works in Server Actions)
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Use pdf-parse for server-side PDF extraction
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(buffer);

      return pdfData.text;
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error(`Failed to extract text from PDF: ${(error as Error).message}`);
    }
  }

  /**
   * Splits a long text into smaller chunks with overlap.
   */
  splitTextIntoChunks(text: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < text.length) {
      // Calculate end index for this chunk
      const endIndex = Math.min(startIndex + CHUNK_SIZE, text.length);

      // Extract chunk content
      const content = text.slice(startIndex, endIndex);

      // Create chunk object
      chunks.push({
        content,
        chunkIndex,
        metadata: {
          characterStart: startIndex,
          characterEnd: endIndex,
        },
      });

      // Move to next chunk with overlap
      startIndex += CHUNK_SIZE - CHUNK_OVERLAP;
      chunkIndex++;
    }

    return chunks;
  }

  /**
   * Estimates the token count for a text string.
   */
  estimateTokenCount(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Processes a document file by:
   * 1. Creating a document record in the database
   * 2. Extracting text from the file
   * 3. Splitting text into chunks
   * 4. Generating embeddings for each chunk
   * 5. Storing chunks with embeddings in the database
   */
  async processDocument(file: File, userId: string): Promise<string> {
    let documentId: string | null = null;

    try {
      // Step 1: Create document record
      documentId = await this.createDocumentRecord(file, userId);

      // Step 2: Extract text from file
      const text = await this.extractTextFromFile(file);

      // Step 3: Split into chunks
      const chunks = this.splitTextIntoChunks(text);

      // Step 4 & 5: Generate embeddings and store chunks
      await this.processAndStoreChunks(documentId, chunks);

      // Update document status to completed
      await this.updateDocumentStatus(documentId, 'completed');

      return documentId;
    } catch (error) {
      console.error('Error processing document:', error);

      // Update status to failed if we have a document ID
      if (documentId) {
        try {
          await this.updateDocumentStatus(documentId, 'failed', (error as Error).message);
        } catch (updateError) {
          console.error('Failed to update document status:', updateError);
        }
      }

      throw error;
    }
  }

  /**
   * Creates a document record in the database (public for async workflow).
   */
  async createDocumentRecord(file: File, userId: string): Promise<string> {
    try {
      const res = await pool.query(
        `INSERT INTO documents (filename, file_type, file_size, uploaded_by, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [file.name, file.type || 'text/plain', file.size, userId, 'processing']
      );
      return res.rows[0].id;
    } catch (error: any) {
      throw new Error(`Failed to create document record: ${error.message}`);
    }
  }

  /**
   * Processes a document's content after it has been created.
   * This is meant to be called asynchronously (fire-and-forget).
   */
  async processDocumentContent(documentId: string, text: string): Promise<void> {
    try {
      // Split into chunks
      const chunks = this.splitTextIntoChunks(text);

      // Generate embeddings and store chunks
      await this.processAndStoreChunks(documentId, chunks);

      // Update document status to completed
      await this.updateDocumentStatus(documentId, 'completed');
    } catch (error) {
      console.error('Error processing document content:', error);

      // Update status to failed
      try {
        await this.updateDocumentStatus(documentId, 'failed', (error as Error).message);
      } catch (updateError) {
        console.error('Failed to update document status:', updateError);
      }
    }
  }

  /**
   * Processes chunks by generating embeddings and storing in database.
   */
  private async processAndStoreChunks(
    documentId: string,
    chunks: DocumentChunk[]
  ): Promise<void> {
    // Process chunks in batches to avoid overwhelming the API
    const BATCH_SIZE = 10;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);
      const batchTexts = batchChunks.map(chunk => chunk.content);

      // Generate embeddings for this batch
      const embeddings = await this.embeddingService.generateEmbeddingsBatch(batchTexts);

      // Prepare chunk records for database insertion
      for (const [index, chunk] of batchChunks.entries()) {
        const embedding = embeddings[index].embedding;
        const embeddingString = `[${embedding.join(',')}]`;

        await pool.query(
          `INSERT INTO document_chunks (document_id, chunk_index, content, embedding, token_count, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            documentId,
            chunk.chunkIndex,
            chunk.content,
            embeddingString,
            this.estimateTokenCount(chunk.content),
            chunk.metadata
          ]
        );
      }
    }
  }

  /**
   * Updates the status of a document.
   */
  private async updateDocumentStatus(
    documentId: string,
    status: 'processing' | 'completed' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    try {
      await pool.query(
        'UPDATE documents SET status = $1, error_message = $2 WHERE id = $3',
        [status, errorMessage || null, documentId]
      );
    } catch (error: any) {
      throw new Error(`Failed to update document status: ${error.message}`);
    }
  }

  /**
   * Retrieves all documents for a specific user from the database.
   */
  async getAllDocuments(userId: string): Promise<any[]> {
    try {
      const res = await pool.query(
        'SELECT * FROM documents WHERE uploaded_by = $1 ORDER BY uploaded_at DESC',
        [userId]
      );
      return res.rows;
    } catch (error: any) {
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }
  }

  /**
   * Deletes a document and all its chunks from the database.
   * Only allows deletion if the user owns the document.
   */
  async deleteDocument(documentId: string, userId: string): Promise<void> {
    try {
      const result = await pool.query(
        'DELETE FROM documents WHERE id = $1 AND uploaded_by = $2',
        [documentId, userId]
      );
      if (result.rowCount === 0) {
        throw new Error('Document not found or you do not have permission to delete it');
      }
    } catch (error: any) {
      throw new Error(`Failed to delete document: ${error.message}`);
    }
  }
}
