#!/usr/bin/env node

const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const models = (process.env.EMBEDDING_BENCHMARK_MODELS || 'embeddinggemma,nomic-embed-text-v2-moe')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const cases = [
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

function cosine(a, b) {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return dot / (Math.sqrt(aa) * Math.sqrt(bb));
}

async function embed(model, input) {
  const response = await fetch(`${baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input, keep_alive: '10m' }),
  });
  if (!response.ok) {
    throw new Error(`${model}: HTTP ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  return body.embeddings;
}

async function benchmark(model) {
  const coldStarted = performance.now();
  const cold = await embed(model, ['allerac embedding cold start']);
  const coldMs = performance.now() - coldStarted;

  const warmStarted = performance.now();
  const warm = await embed(model, ['allerac embedding warm request']);
  const warmMs = performance.now() - warmStarted;
  const dimension = warm[0].length;

  let correct = 0;
  const retrievalStarted = performance.now();
  for (const item of cases) {
    const documents = [item.relevant, ...item.negatives];
    const vectors = await embed(model, [item.query, ...documents]);
    const scores = documents.map((text, index) => ({
      text,
      score: cosine(vectors[0], vectors[index + 1]),
    }));
    scores.sort((a, b) => b.score - a.score);
    if (scores[0].text === item.relevant) correct += 1;
  }
  const retrievalMs = performance.now() - retrievalStarted;

  const batchInputs = Array.from({ length: 100 }, (_, index) =>
    `Documento de benchmark ${index}: conteúdo sobre notas, tarefas, saúde e recuperação do Allerac.`,
  );
  const batchStarted = performance.now();
  const batch = await embed(model, batchInputs);
  const batchMs = performance.now() - batchStarted;

  return {
    model,
    dimension,
    coldMs: Math.round(coldMs),
    warmMs: Math.round(warmMs),
    retrieval: `${correct}/${cases.length}`,
    retrievalMs: Math.round(retrievalMs),
    batchCount: batch.length,
    batchMs: Math.round(batchMs),
    batchPerItemMs: Number((batchMs / batch.length).toFixed(1)),
  };
}

const results = [];
for (const model of models) {
  try {
    results.push(await benchmark(model));
  } catch (error) {
    results.push({ model, error: error instanceof Error ? error.message : String(error) });
  }
}

console.table(results);
console.log(JSON.stringify({ baseUrl, results }, null, 2));
