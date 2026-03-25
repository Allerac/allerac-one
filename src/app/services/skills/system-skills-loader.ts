/**
 * SystemSkillsLoader
 *
 * Reads .md files from /project/skills/ (repo-mounted volume) and upserts
 * them into the skills table as system skills (is_system=true, user_id=NULL).
 *
 * Called once on app startup via instrumentation.ts.
 * Re-syncs on every deploy automatically.
 */

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import pool from '../../clients/db';

const SKILLS_DIR = process.env.SKILLS_DIR || '/app/skills';

interface SkillFrontmatter {
  name: string;
  display_name: string;
  description: string;
  category?: string;
  force_tool?: string;
  auto_switch_rules?: Record<string, any>;
  version?: string;
  icon?: string;
}

function parseFrontmatter(raw: string): { meta: Partial<SkillFrontmatter>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw.trim() };

  const meta: Partial<SkillFrontmatter> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key === 'auto_switch_rules') {
      try { (meta as any)[key] = JSON.parse(val); } catch { /* ignore */ }
    } else {
      (meta as any)[key] = val;
    }
  }
  return { meta, content: match[2].trim() };
}

export async function syncSystemSkills(): Promise<void> {
  let files: string[];
  try {
    files = (await readdir(SKILLS_DIR)).filter(f => f.endsWith('.md'));
  } catch (err) {
    console.log('[SystemSkills] Skills dir not found, skipping sync:', SKILLS_DIR);
    return;
  }

  let synced = 0;

  for (const file of files) {
    try {
      const raw = await readFile(path.join(SKILLS_DIR, file), 'utf8');
      const { meta, content } = parseFrontmatter(raw);

      if (!meta.name || !meta.display_name || !meta.description) {
        console.warn(`[SystemSkills] Skipping ${file}: missing required frontmatter fields`);
        continue;
      }

      // Upsert by source_file — system skills are identified by filename
      await pool.query(`
        INSERT INTO skills (
          user_id, name, display_name, description, content, category,
          force_tool, auto_switch_rules, version, is_system, source_file,
          verified, shared, learning_enabled, memory_scope, rag_integration
        ) VALUES (
          NULL, $1, $2, $3, $4, $5, $6, $7, $8, true, $9,
          true, true, false, 'user', false
        )
        ON CONFLICT (source_file) WHERE is_system = true
        DO UPDATE SET
          name              = EXCLUDED.name,
          display_name      = EXCLUDED.display_name,
          description       = EXCLUDED.description,
          content           = EXCLUDED.content,
          category          = EXCLUDED.category,
          force_tool        = EXCLUDED.force_tool,
          auto_switch_rules = EXCLUDED.auto_switch_rules,
          version           = EXCLUDED.version,
          updated_at        = NOW()
      `, [
        meta.name,
        meta.display_name,
        meta.description,
        content,
        meta.category || 'general',
        meta.force_tool || null,
        meta.auto_switch_rules ? JSON.stringify(meta.auto_switch_rules) : null,
        meta.version || '1.0.0',
        file,
      ]);

      synced++;
    } catch (err) {
      console.error(`[SystemSkills] Failed to sync ${file}:`, err);
    }
  }

  console.log(`[SystemSkills] Synced ${synced}/${files.length} system skills from ${SKILLS_DIR}`);
}
