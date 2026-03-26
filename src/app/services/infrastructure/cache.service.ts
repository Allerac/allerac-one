// Cache service for query normalization, hashing, and semantic deduplication

/**
 * Normalize query for better cache matching (works for PT, EN, and ES)
 * Removes stopwords, punctuation, and sorts words alphabetically
 */
export const normalizeQueryForCache = (query: string): string => {
  // Stopwords in Portuguese, English, and Spanish
  const stopwords = new Set([
    // Portuguese
    'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das',
    'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sem',
    'é', 'são', 'está', 'estão', 'foi', 'eram', 'ser', 'estar',
    'qual', 'quais', 'como', 'onde', 'quando', 'que', 'quem',
    'este', 'esse', 'aquele', 'isso', 'isto', 'aquilo',
    'me', 'te', 'se', 'lhe', 'nos', 'vos', 'lhes',
    // English
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'what', 'which', 'how', 'where', 'when', 'who', 'whom',
    'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'my', 'your', 'his', 'her', 'its', 'our', 'their',
    // Spanish
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'de', 'del', 'al', 'en', 'con', 'sin', 'por', 'para',
    'es', 'son', 'está', 'están', 'fue', 'fueron', 'ser', 'estar',
    'cuál', 'cuáles', 'cómo', 'dónde', 'cuándo', 'qué', 'quién', 'quiénes',
    'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
    'aquel', 'aquella', 'aquellos', 'aquellas', 'esto', 'eso', 'aquello',
    'me', 'te', 'se', 'le', 'nos', 'os', 'les',
    'mi', 'tu', 'su', 'mis', 'tus', 'sus',
  ]);

  return query
    .toLowerCase()
    .trim()
    // Remove punctuation
    .replace(/[.,!?;:¿¡"""''()[\]{}]/g, '')
    // Split into words
    .split(/\s+/)
    // Remove stopwords
    .filter(word => word.length > 2 && !stopwords.has(word))
    // Sort alphabetically for consistent ordering
    .sort()
    // Join back
    .join(' ');
};

/**
 * Generate SHA-256 hash from string
 */
export const hashString = async (str: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * SemanticQueryCache
 *
 * In-memory cache that matches queries by semantic similarity (cosine distance
 * of embeddings) rather than exact text. This allows cross-language cache hits:
 * "current edinburgh weather" and "qual a temperatura em Edimburgo" will share
 * the same cached Tavily result because their embeddings are ~0.96 similar.
 *
 * Two-level strategy used by SearchWebTool:
 *   Level 1 — DB hash (exact/near-exact, any language, persistent across restarts)
 *   Level 2 — SemanticQueryCache (cross-language, in-process, TTL-based)
 */
export class SemanticQueryCache<T = any> {
  private entries: Array<{
    embedding: number[];
    result: T;
    cachedQuery: string;   // original query that populated this entry (for logging)
    expiresAt: number;
  }> = [];

  constructor(
    private readonly similarityThreshold = 0.94,
    private readonly ttlMs = 24 * 60 * 60 * 1000,  // 24h
    private readonly maxEntries = 200,
  ) {}

  private cosine(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot  += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  get(embedding: number[]): { result: T; cachedQuery: string; similarity: number } | null {
    const now = Date.now();
    let best: { result: T; cachedQuery: string; similarity: number } | null = null;
    for (const entry of this.entries) {
      if (entry.expiresAt < now) continue;
      const sim = this.cosine(embedding, entry.embedding);
      if (sim >= this.similarityThreshold && (!best || sim > best.similarity)) {
        best = { result: entry.result, cachedQuery: entry.cachedQuery, similarity: sim };
      }
    }
    return best;
  }

  set(embedding: number[], result: T, cachedQuery: string): void {
    const now = Date.now();
    this.entries = this.entries.filter(e => e.expiresAt > now);
    if (this.entries.length >= this.maxEntries) this.entries.shift();
    this.entries.push({ embedding, result, cachedQuery, expiresAt: now + this.ttlMs });
  }

  get size(): number {
    return this.entries.filter(e => e.expiresAt > Date.now()).length;
  }
}

// Global singleton — survives hot-reloads in dev
const g = globalThis as any;
if (!g.__allerac_semantic_search_cache) {
  g.__allerac_semantic_search_cache = new SemanticQueryCache();
}
export const semanticSearchCache: SemanticQueryCache = g.__allerac_semantic_search_cache;
