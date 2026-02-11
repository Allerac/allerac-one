/**
 * VectorSearchService
 *
 * Performs semantic similarity search on document embeddings.
 * Uses cosine similarity to find the most relevant document chunks
 * for a given query, enabling Retrieval Augmented Generation (RAG).
 */

import pool from '@/app/clients/db';
import { EmbeddingService } from './embedding.service';

export interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  similarity: number; // Cosine similarity score (0-1, higher is more similar)
  metadata: any;
  documentFilename?: string;
}

export interface SearchOptions {
  limit?: number; // Maximum number of results to return
  similarityThreshold?: number; // Minimum similarity score (0-1)
}

export class VectorSearchService {
  private embeddingService: EmbeddingService;

  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
  }

  /**
   * Searches for document chunks that are semantically similar to the query.
   * Results are filtered to only include documents owned by the specified user.
   *
   * Process:
   * 1. Generate embedding for the search query
   * 2. Use pgvector's cosine similarity to find nearest neighbors
   * 3. Return ranked results with metadata
   *
   * @param query - The search query text
   * @param userId - The user ID to filter documents by
   * @param options - Search configuration options
   * @returns Promise with array of ranked search results
   */
  async searchSimilarChunks(
    query: string,
    userId: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    // Set default options
    const limit = options.limit || 5;
    // Lower threshold = accepts more distant matches. 0.2 similarity → 0.8 distance threshold
    const similarityThreshold = options.similarityThreshold || 0.2;

    console.log('[VectorSearch] searchSimilarChunks:', { query: query.substring(0, 30), userId, limit, similarityThreshold });

    try {
      // Step 1: Generate embedding for the query
      const { embedding } = await this.embeddingService.generateEmbedding(query);
      console.log('[VectorSearch] Embedding generated, length:', embedding.length);

      // Format embedding for pgvector (string representation: "[0.1, 0.2, ...]")
      const embeddingString = `[${embedding.join(',')}]`;

      // Step 2: Perform vector similarity search using pgvector
      // We call the stored function search_document_chunks defined in init.sql
      // Now includes user_id parameter for security filtering
      console.log('[VectorSearch] Querying DB with:', { userId, threshold: 1 - similarityThreshold, limit });

      const res = await pool.query(
        'SELECT * FROM search_document_chunks($1, $2, $3, $4)',
        [
          embeddingString,
          userId, // search_user_id
          1 - similarityThreshold, // match_threshold (distance)
          limit, // match_count
        ]
      );

      console.log('[VectorSearch] Results found:', res.rows.length, res.rows.map((r: any) => ({ filename: r.document_filename, distance: r.distance })));

      // Step 3: Format and return results
      return res.rows.map((row: any) => ({
        chunkId: row.chunk_id,
        documentId: row.document_id,
        content: row.content,
        similarity: 1 - row.distance, // Convert distance back to similarity
        metadata: row.metadata,
        documentFilename: row.document_filename,
      }));
    } catch (error) {
      console.error('Error in vector search:', error);
      throw error;
    }
  }

  /**
   * Searches for relevant context and formats it for inclusion in a prompt.
   * This is the main method to use for RAG.
   *
   * @param query - The user's query
   * @param userId - The user ID to filter documents by
   * @param options - Search configuration
   * @returns Formatted context string to include in AI prompt
   */
  async getRelevantContext(
    query: string,
    userId: string,
    options: SearchOptions = {}
  ): Promise<string> {
    const results = await this.searchSimilarChunks(query, userId, options);

    if (results.length === 0) {
      return 'No relevant documents found in the knowledge base.';
    }

    // Format results into a readable context
    const contextParts = results.map((result, index) => {
      return `[Document ${index + 1}: ${result.documentFilename || 'Unknown'} (Relevance: ${(result.similarity * 100).toFixed(1)}%)]
${result.content}`;
    });

    return `RELEVANT KNOWLEDGE BASE CONTEXT:

${contextParts.join('\n\n---\n\n')}

Please use the above context to answer the user's question. If the context doesn't contain relevant information, acknowledge that and use your general knowledge.`;
  }

  /**
   * Checks if there are any documents available for search for a specific user.
   * Useful for showing/hiding search-related UI elements.
   */
  async hasDocuments(userId: string): Promise<boolean> {
    try {
      const res = await pool.query(
        'SELECT id FROM documents WHERE status = $1 AND uploaded_by = $2 LIMIT 1',
        ['completed', userId]
      );
      return res.rows.length > 0;
    } catch (error) {
      console.error('Error checking for documents:', error);
      return false;
    }
  }

  /**
   * Gets statistics about the document collection for a specific user.
   */
  async getCollectionStats(userId: string): Promise<{
    documentCount: number;
    chunkCount: number;
    totalSize: number;
  }> {
    try {
      // Get document count and total size for this user
      const docRes = await pool.query(
        'SELECT id, file_size FROM documents WHERE status = $1 AND uploaded_by = $2',
        ['completed', userId]
      );

      const docData = docRes.rows;
      const documentCount = docData.length;
      const totalSize = docData.reduce((sum, doc) => sum + doc.file_size, 0);

      // Get chunk count for this user's documents
      const chunkRes = await pool.query(
        `SELECT COUNT(*) FROM document_chunks dc
         JOIN documents d ON dc.document_id = d.id
         WHERE d.uploaded_by = $1`,
        [userId]
      );
      const chunkCount = parseInt(chunkRes.rows[0].count, 10);

      return {
        documentCount,
        chunkCount,
        totalSize,
      };
    } catch (error: any) {
      console.error('Error checking for stats:', error);
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }
}
