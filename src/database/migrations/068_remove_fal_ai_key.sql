-- Image editing now uses Gemini Image through the existing Google API key.
DELETE FROM system_settings WHERE key = 'fal_ai_api_key';
