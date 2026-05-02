/**
 * Parser for skill metadata from YAML frontmatter
 * Extracts keywords, file_types, and other detection rules from skill content
 */

export interface SkillMetadata {
  name?: string;
  keywords?: string[];
  file_types?: string[];
  description?: string;
  category?: string;
}

export class SkillMetadataParser {
  // Hardcoded skill keywords that may not be in content yet
  // This allows keyword detection to work while we migrate content frontmatter
  static readonly SKILL_KEYWORDS: Record<string, string[]> = {
    programmer: [
      'cria', 'criar', 'crie', 'build', 'make', 'projeto', 'project', 'setup',
      'instala', 'install', 'escreve', 'escrever', 'write', 'code', 'código',
      'script', 'app', 'aplicação', 'application', 'node', 'python', 'react',
      'express', 'api', 'server', 'servidor', 'arquivo', 'file', 'pasta',
      'folder', 'directory', 'programar', 'programação', 'programa', 'programming'
    ],
    'code-analyzer': [
      'analyze', 'analisa', 'analise', 'review', 'revisar', 'revisão', 'read',
      'code', 'código', 'understand', 'entende', 'explain', 'explica'
    ],
    search: [
      'search', 'find', 'find information', 'look up', 'procura', 'procurar',
      'pesquisa', 'pesquisar'
    ],
    analyst: [
      'analyze', 'analisa', 'data', 'dados', 'pattern', 'padrão', 'insight',
      'report', 'relatório'
    ],
  };

  /**
   * Extract YAML frontmatter metadata from skill content
   * Expects format:
   * ---
   * name: skill-name
   * keywords:
   *   - keyword1
   *   - keyword2
   * ---
   */
  static parseMetadata(content: string, skillName?: string): SkillMetadata {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const metadata: SkillMetadata = {};

    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];

      // Parse name
      const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
      if (nameMatch) metadata.name = nameMatch[1].trim();

      // Parse description
      const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
      if (descMatch) metadata.description = descMatch[1].trim();

      // Parse category
      const catMatch = frontmatter.match(/^category:\s*(.+)$/m);
      if (catMatch) metadata.category = catMatch[1].trim();

      // Parse keywords array
      const keywordsMatch = frontmatter.match(/^keywords:\n((?:\s+-\s+.+\n?)+)/m);
      if (keywordsMatch) {
        metadata.keywords = keywordsMatch[1]
          .split('\n')
          .map(line => line.replace(/^\s*-\s+/, '').trim())
          .filter(kw => kw.length > 0);
      }

      // Parse file_types array
      const fileTypesMatch = frontmatter.match(/^file_types:\n((?:\s+-\s+.+\n?)+)/m);
      if (fileTypesMatch) {
        metadata.file_types = fileTypesMatch[1]
          .split('\n')
          .map(line => line.replace(/^\s*-\s+/, '').trim())
          .filter(ft => ft.length > 0);
      }
    }

    // Fallback to hardcoded keywords if not found in frontmatter
    if (!metadata.keywords && skillName && skillName in this.SKILL_KEYWORDS) {
      metadata.keywords = this.SKILL_KEYWORDS[skillName as keyof typeof this.SKILL_KEYWORDS];
    }

    return metadata;
  }

  /**
   * Check if a message matches skill keywords
   */
  static matchesKeywords(message: string, keywords?: string[]): boolean {
    if (!keywords || keywords.length === 0) return false;
    const lowerMessage = message.toLowerCase();
    return keywords.some(kw => lowerMessage.includes(kw.toLowerCase()));
  }

  /**
   * Check if a message matches file types
   */
  static matchesFileTypes(message: string, fileTypes?: string[]): boolean {
    if (!fileTypes || fileTypes.length === 0) return false;
    return fileTypes.some(ft => message.includes(ft));
  }
}
