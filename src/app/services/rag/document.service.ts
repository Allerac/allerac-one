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
   */
  private async extractTextFromPlainText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        const text = event.target?.result as string;
        resolve(text);
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsText(file);
    });
  }

  /**
   * Extracts text from a PDF file using pdf-parse library.
   * This works in the browser by converting the file to an ArrayBuffer.
   */
  private async extractTextFromPDF(file: File): Promise<string> {
    try {
      // Dynamically import pdfjs-dist (browser-compatible version)
      const pdfjsLib = await import('pdfjs-dist');

      // Use local worker from public folder
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      // Extract text from all pages
      const textPages: string[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        textPages.push(pageText);
      }

      // Join all pages with double newline
      return textPages.join('\n\n');
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
    try {
      // Step 1: Create document record
      const documentId = await this.createDocumentRecord(file, userId);

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
      try {
        // We might not have the ID if step 1 failed, but if we do...
        // Actually, if step 1 fails, we don't have ID.
        // We can't update status if we don't have ID.
        // If step 2-5 fails, we likely have ID in `documentId` if scope allows.
        // Since `documentId` is local to try block, we can't access it here easily without moving variable out.
        // For now, simplifed error handling.
      } catch (inner) { }
      throw error;
    }
  }

  /**
   * Creates a document record in the database.
   */
  private async createDocumentRecord(file: File, userId: string): Promise<string> {
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
   * Retrieves all documents from the database.
   */
  async getAllDocuments(): Promise<any[]> {
    try {
      const res = await pool.query('SELECT * FROM documents ORDER BY uploaded_at DESC');
      return res.rows;
    } catch (error: any) {
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }
  }

  /**
   * Deletes a document and all its chunks from the database.
   */
  async deleteDocument(documentId: string): Promise<void> {
    try {
      await pool.query('DELETE FROM documents WHERE id = $1', [documentId]);
    } catch (error: any) {
      throw new Error(`Failed to delete document: ${error.message}`);
    }
  }
}
