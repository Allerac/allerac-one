const DEFAULT_MODELS = ['embeddinggemma', 'nomic-embed-text-v2-moe'];
const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/;

export interface EmbeddingBenchmarkResult {
  model: string;
  dimensions: number;
  firstRequestMs: number;
  warmMs: number;
  retrievalCorrect: number;
  retrievalTotal: number;
  retrievalMs: number;
  batchCount: number;
  batchMs: number;
  batchPerItemMs: number;
}

export interface EmbeddingBenchmarkFailure {
  model: string;
  error: string;
}

interface RetrievalCase {
  query: string;
  relevant: string;
  negatives: string[];
}

const RETRIEVAL_CASES: RetrievalCase[] = [
  {
    query: 'Como faço uma cópia de segurança dos meus dados?',
    relevant: 'O backup portátil inclui o banco PostgreSQL, volumes e configurações criptografadas.',
    negatives: [
      'A previsão do tempo indica chuva durante a tarde.',
      'As recomendações musicais usam o histórico recente do Spotify.',
    ],
  },
  {
    query: '¿Dónde puedo cambiar una tarea programada?',
    relevant: 'Las tareas recurrentes se administran en el dominio Jobs y pueden editarse o eliminarse.',
    negatives: [
      'El panel de salud muestra actividades y ejercicios recientes.',
      'La búsqueda web utiliza una caché para evitar solicitudes repetidas.',
    ],
  },
  {
    query: 'Which credential is required for Anthropic chat?',
    relevant: 'Anthropic chat requests require an Anthropic API key configured by the user or system administrator.',
    negatives: [
      'Document chunks are compared with cosine distance in PostgreSQL.',
      'The Android robot connects to the Control API using a scoped API key.',
    ],
  },
  {
    query: 'onde ficam as memórias das conversas?',
    relevant: 'Conversation summaries and memories are stored in PostgreSQL and can be scoped by domain.',
    negatives: [
      'O Ollama executa modelos locais dentro de um container.',
      'As playlists do Spotify possuem nome, descrição e imagem.',
    ],
  },
  {
    query: 'buscar una nota sobre facturas pendientes',
    relevant: 'La búsqueda semántica de notas encuentra contenido relacionado aunque no use las mismas palabras.',
    negatives: [
      'Los documentos PDF se dividen en fragmentos antes de indexarse.',
      'La aplicación puede enviar notificaciones por Telegram.',
    ],
  },
  {
    query: 'find documentation about restoring on a clean server',
    relevant: 'The portable restore procedure reconstructs Allerac on a clean Docker host and validates checksums.',
    negatives: [
      'The finance domain tracks market prices and portfolio information.',
      'The design domain can help create interface concepts.',
    ],
  },
];

function configuredModels(): string[] {
  return (process.env.EMBEDDING_BENCHMARK_MODELS || DEFAULT_MODELS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter((value) => MODEL_ID_PATTERN.test(value));
}

function prepareInput(model: string, text: string, purpose: 'query' | 'document'): string {
  if (model.startsWith('nomic-embed-text-v2-moe')) {
    return `${purpose === 'query' ? 'search_query' : 'search_document'}: ${text}`;
  }
  return text;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function embed(
  baseUrl: string,
  model: string,
  texts: string[],
  purpose: 'query' | 'document',
): Promise<number[][]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: texts.map((text) => prepareInput(model, text, purpose)),
        keep_alive: '10m',
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
    }
    const body = await response.json() as { embeddings?: number[][] };
    if (!Array.isArray(body.embeddings) || body.embeddings.length !== texts.length) {
      throw new Error(`Ollama returned ${body.embeddings?.length ?? 0} vectors for ${texts.length} inputs`);
    }
    return body.embeddings;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listEmbeddingBenchmarkModels(): Promise<Array<{
  id: string;
  installed: boolean;
}>> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/$/, '');
  let installed = new Set<string>();
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { cache: 'no-store' });
    if (response.ok) {
      const body = await response.json() as { models?: Array<{ name?: string }> };
      installed = new Set((body.models || []).flatMap((model) => {
        if (!model.name) return [];
        return [model.name, model.name.replace(/:latest$/, '')];
      }));
    }
  } catch {
    // Report candidates as unavailable when Ollama cannot be reached.
  }
  return configuredModels().map((id) => ({ id, installed: installed.has(id) }));
}

export async function runEmbeddingBenchmark(
  requestedModels: string[],
): Promise<Array<EmbeddingBenchmarkResult | EmbeddingBenchmarkFailure>> {
  const allowed = new Set(configuredModels());
  const models = [...new Set(requestedModels)];
  if (models.length === 0 || models.length > 3 || models.some((model) => !allowed.has(model))) {
    throw new Error('Invalid embedding benchmark model selection');
  }

  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/$/, '');
  const results: Array<EmbeddingBenchmarkResult | EmbeddingBenchmarkFailure> = [];

  for (const model of models) {
    try {
      const firstStarted = performance.now();
      const first = await embed(baseUrl, model, ['allerac embedding first request'], 'query');
      const firstRequestMs = performance.now() - firstStarted;

      const warmStarted = performance.now();
      const warm = await embed(baseUrl, model, ['allerac embedding warm request'], 'query');
      const warmMs = performance.now() - warmStarted;
      const dimensions = warm[0].length;
      if (first[0].length !== dimensions) throw new Error('Embedding dimension changed between requests');

      let retrievalCorrect = 0;
      const retrievalStarted = performance.now();
      for (const item of RETRIEVAL_CASES) {
        const queryVector = (await embed(baseUrl, model, [item.query], 'query'))[0];
        const documents = [item.relevant, ...item.negatives];
        const documentVectors = await embed(baseUrl, model, documents, 'document');
        const ranking = documentVectors
          .map((vector, index) => ({ index, score: cosine(queryVector, vector) }))
          .sort((a, b) => b.score - a.score);
        if (ranking[0]?.index === 0) retrievalCorrect += 1;
      }
      const retrievalMs = performance.now() - retrievalStarted;

      const batchInputs = Array.from(
        { length: 100 },
        (_, index) => `Documento ${index}: conteúdo sobre notas, tarefas, saúde e recuperação do Allerac.`,
      );
      const batchStarted = performance.now();
      const batch = await embed(baseUrl, model, batchInputs, 'document');
      const batchMs = performance.now() - batchStarted;

      results.push({
        model,
        dimensions,
        firstRequestMs: Math.round(firstRequestMs),
        warmMs: Math.round(warmMs),
        retrievalCorrect,
        retrievalTotal: RETRIEVAL_CASES.length,
        retrievalMs: Math.round(retrievalMs),
        batchCount: batch.length,
        batchMs: Math.round(batchMs),
        batchPerItemMs: Number((batchMs / batch.length).toFixed(1)),
      });
    } catch (error) {
      results.push({
        model,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

