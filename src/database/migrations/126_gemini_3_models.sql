-- Seed pricing for the new Gemini 3.x models (estimates — adjust via the admin pricing panel).
INSERT INTO model_pricing (model_id, provider, display_name, input_price_per_1m, output_price_per_1m) VALUES
  ('gemini-3.5-flash-lite',  'gemini', 'Gemini 3.5 Flash Lite',  0.075000, 0.300000),
  ('gemini-3.7-flash',       'gemini', 'Gemini 3.7 Flash',       0.200000, 0.800000),
  ('gemini-3.1-pro-preview', 'gemini', 'Gemini 3.1 Pro Preview', 1.250000, 5.000000)
ON CONFLICT (model_id) DO NOTHING;
