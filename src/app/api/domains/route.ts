import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
  try {
    const configPath = join(process.cwd(), 'config', 'domains.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return Response.json({ visible: config.visible });
  } catch (error) {
    // Fallback to all domains if config not found
    return Response.json({
      visible: ['chat', 'code', 'recipes', 'finance', 'health', 'write', 'social'],
    });
  }
}
