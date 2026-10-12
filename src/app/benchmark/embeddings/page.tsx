import Link from 'next/link';
import { Metadata } from 'next';
import { EmbeddingBenchmark } from '@/app/components/benchmark/embedding-benchmark';
import { requireAdmin } from '@/app/lib/domain-access';

export const metadata: Metadata = {
  title: 'Embedding Benchmark - Allerac',
  description: 'Compare local embedding models on the Allerac host',
};

export default async function EmbeddingBenchmarkPage() {
  await requireAdmin();
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <Link href="/benchmark" className="text-sm text-slate-400 hover:text-white">
            ← Back to Benchmark
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-white">Embedding Benchmark</h1>
          <p className="mt-2 text-slate-400">
            Compare local semantic retrieval quality and performance on this Allerac host.
          </p>
        </div>

        <EmbeddingBenchmark />

        <section className="mt-10 rounded-xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white">What this measures</h2>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-slate-300">
            <li>First request latency, including model load when it is not already resident.</li>
            <li>Warm latency for an interactive RAG query.</li>
            <li>Top-1 retrieval over Portuguese, Spanish, English, and cross-language cases.</li>
            <li>Throughput for a background batch of 100 representative inputs.</li>
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Recent run history is stored only in this browser. Model execution happens
            server-side against the internal Ollama service.
          </p>
        </section>
      </div>
    </main>
  );
}
