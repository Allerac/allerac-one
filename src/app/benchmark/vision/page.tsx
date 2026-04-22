import { Metadata } from 'next';
import { VisionBenchmark } from '@/app/components/benchmark/vision-benchmark';

export const metadata: Metadata = {
  title: 'Vision Benchmark - Allerac',
  description: 'Test which AI models can describe images',
};

export default function VisionBenchmarkPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Vision Benchmark</h1>
          <p className="text-slate-400">Test which models can see and describe images</p>
        </div>

        <VisionBenchmark />

        <div className="mt-12 bg-slate-900 rounded-lg p-6 border border-slate-700">
          <h2 className="text-lg font-bold text-white mb-4">About</h2>
          <div className="space-y-3 text-slate-300 text-sm">
            <p>
              This benchmark tests different AI models to see which ones support multimodal image understanding (vision).
            </p>
            <p>
              <strong>Models tested:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>
                <strong>GPT-4o (GitHub)</strong> - OpenAI&apos;s latest vision model
              </li>
              <li>
                <strong>Gemini 2.5 Flash</strong> - Google&apos;s fast vision model
              </li>
              <li>
                <strong>Gemma 4 26B (Local)</strong> - Larger multimodal model with vision support
              </li>
            </ul>
            <p className="mt-4">
              <strong>Note:</strong> You need to configure API keys in your settings for cloud providers.
              Local models run via Ollama and are free.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
