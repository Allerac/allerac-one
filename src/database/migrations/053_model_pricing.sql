CREATE TABLE IF NOT EXISTS model_pricing (
  model_id             TEXT PRIMARY KEY,
  provider             TEXT NOT NULL,
  display_name         TEXT NOT NULL,
  input_price_per_1m   NUMERIC(12, 6) NOT NULL DEFAULT 0,
  output_price_per_1m  NUMERIC(12, 6) NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO model_pricing (model_id, provider, display_name, input_price_per_1m, output_price_per_1m) VALUES
  ('gpt-4o',                   'github',    'GPT-4o',            2.500000,  10.000000),
  ('gpt-4o-mini',              'github',    'GPT-4o Mini',       0.150000,   0.600000),
  ('o1-preview',               'github',    'o1 Preview',       15.000000,  60.000000),
  ('o1-mini',                  'github',    'o1 Mini',           3.000000,  12.000000),
  ('ministral-3b',             'github',    'Ministral 3B',      0.040000,   0.040000),
  ('gemini-2.5-flash',         'gemini',    'Gemini 2.5 Flash',  0.150000,   0.600000),
  ('claude-haiku-4-5-20251001','anthropic', 'Claude Haiku 4.5',  0.800000,   4.000000),
  ('claude-sonnet-4-6',        'anthropic', 'Claude Sonnet 4.6', 3.000000,  15.000000),
  ('claude-opus-4-7',          'anthropic', 'Claude Opus 4.7',  15.000000,  75.000000),
  ('qwen2.5:3b',               'ollama',    'Qwen 2.5 3B',       0.000000,   0.000000),
  ('deepseek-r1:7b',           'ollama',    'DeepSeek R1 7B',    0.000000,   0.000000),
  ('gemma4',                   'ollama',    'Gemma 4',           0.000000,   0.000000),
  ('gemma4:e2b',               'ollama',    'Gemma 4 E2B',       0.000000,   0.000000)
ON CONFLICT (model_id) DO NOTHING;
