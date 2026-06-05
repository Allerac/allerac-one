-- fal.ai API key for AI image editing (background removal, lifestyle scenes, upscaling)
INSERT INTO system_settings (key, value_encrypted, updated_at)
VALUES ('fal_ai_api_key', '', NOW())
ON CONFLICT (key) DO NOTHING;
