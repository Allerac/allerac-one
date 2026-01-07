// PerceptronMemory.ts
// Prototype: Perceptron-inspired user memory using vector database
//
// This module demonstrates how user corrections (via Correct & Memorize)
// can be stored as vectors and used to update a simple perceptron-like memory.
// The memory can then influence AI responses by comparing new messages to stored vectors.
//
// Dependencies: Assumes you have an embedding function (e.g., OpenAI, Ollama, etc.)
// and a vector database (e.g., Supabase pgvector, Pinecone, etc.)

import { createClient } from '@supabase/supabase-js';

// --- CONFIG ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- TYPES ---
export interface UserCorrection {
  id: string;
  user_id: string;
  conversation_id: string;
  correction: string;
  embedding: number[]; // Vector representation
  created_at: string;
}

// --- EMBEDDING FUNCTION (stub) ---
// Replace with your actual embedding provider
export async function embedText(text: string): Promise<number[]> {
  // Example: Call OpenAI, Ollama, or local embedding model
  // return await fetchEmbedding(text);
  return Array(1536).fill(0); // Dummy vector for prototype
}

// --- SAVE CORRECTION AS VECTOR ---
export async function saveCorrection(userId: string, conversationId: string, correction: string) {
  const embedding = await embedText(correction);
  const { data, error } = await supabase.from('user_corrections').insert([
    { user_id: userId, conversation_id: conversationId, correction, embedding }
  ]);
  if (error) throw error;
  return data;
}

// --- GET USER MEMORY VECTOR ---
export async function getUserMemoryVector(userId: string): Promise<number[] | null> {
  // Aggregate all correction vectors for this user (e.g., mean)
  const { data, error } = await supabase
    .from('user_corrections')
    .select('embedding')
    .eq('user_id', userId);
  if (error || !data || data.length === 0) return null;
  // Average the vectors
  const vectors = data.map((row: any) => row.embedding);
  const mean = vectors[0].map((_: any, i: number) =>
    vectors.reduce((sum: number, v: number[]) => sum + v[i], 0) / vectors.length
  );
  return mean;
}

// --- COMPARE MESSAGE TO MEMORY ---
export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (normA * normB);
}

export async function isMessageSimilarToUserMemory(userId: string, message: string, threshold = 0.8) {
  const memoryVec = await getUserMemoryVector(userId);
  if (!memoryVec) return false;
  const msgVec = await embedText(message);
  const sim = cosineSimilarity(memoryVec, msgVec);
  return sim >= threshold;
}

// --- USAGE EXAMPLE ---
// 1. When user corrects AI, call saveCorrection(userId, conversationId, correction)
// 2. When AI generates a message, call isMessageSimilarToUserMemory(userId, message)
//    to check if the message aligns with user preferences.
// 3. Use the similarity score to influence or personalize the AI response.

/**
 * This prototype demonstrates a simple, interpretable way to let user feedback
 * shape AI behavior using vector math and a perceptron-like update rule.
 *
 * - User corrections are embedded and stored as vectors.
 * - User memory is the mean of all correction vectors.
 * - New messages are compared to memory using cosine similarity.
 * - If similarity is high, the AI can adapt or recall user preferences.
 *
 * Extend this by using more advanced aggregation, time decay, or clustering.
 */
