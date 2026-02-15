/**
 * SKILL.md Parser - Anthropic Compatible
 * Parses YAML frontmatter + Markdown body following Anthropic Agent Skills standard
 */

import yaml from 'js-yaml';
import type { AutoSwitchRules } from './skills.service';

export interface SkillMetadata {
  name: string;
  description: string;
  category?: string;
  license?: string;
  
  // Allerac extensions
  learning_enabled?: boolean;
  memory_scope?: 'user' | 'bot' | 'global';
  rag_integration?: boolean;
  auto_switch_rules?: AutoSwitchRules;
  
  // Optional metadata
  author?: string;
  version?: string;
  channels?: string[];
  tags?: string[];
}

export interface ParsedSkill {
  metadata: SkillMetadata;
  content: string;
  fullContent: string;  // Original SKILL.md with frontmatter
}

export class SkillParserService {
  /**
   * Parse a SKILL.md file with YAML frontmatter
   * 
   * Example format:
   * ---
   * name: code-reviewer
   * description: Expert code analysis
   * learning_enabled: true
   * ---
   * 
   * # Code Reviewer
   * Instructions...
   */
  parseSkillFile(content: string): ParsedSkill {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      throw new Error('Invalid SKILL.md format: Missing YAML frontmatter');
    }

    const [, frontmatterStr, markdownBody] = match;

    // Parse YAML frontmatter
    let metadata: SkillMetadata;
    try {
      metadata = yaml.load(frontmatterStr) as SkillMetadata;
    } catch (error) {
      throw new Error(`Failed to parse YAML frontmatter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate required fields
    this.validateMetadata(metadata);

    return {
      metadata,
      content: markdownBody.trim(),
      fullContent: content,
    };
  }

  /**
   * Validate skill metadata
   */
  private validateMetadata(metadata: SkillMetadata): void {
    if (!metadata.name) {
      throw new Error('Skill metadata missing required field: name');
    }

    if (!metadata.description) {
      throw new Error('Skill metadata missing required field: description');
    }

    // Validate name format (kebab-case)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(metadata.name)) {
      throw new Error('Skill name must be in kebab-case format (e.g., "code-reviewer")');
    }

    // Validate category
    const validCategories = ['document_creation', 'workflow', 'enhancement'];
    if (metadata.category && !validCategories.includes(metadata.category)) {
      throw new Error(`Invalid category: ${metadata.category}. Must be one of: ${validCategories.join(', ')}`);
    }

    // Validate memory scope
    const validScopes = ['user', 'bot', 'global'];
    if (metadata.memory_scope && !validScopes.includes(metadata.memory_scope)) {
      throw new Error(`Invalid memory_scope: ${metadata.memory_scope}. Must be one of: ${validScopes.join(', ')}`);
    }
  }

  /**
   * Generate SKILL.md content from metadata and body
   */
  generateSkillFile(metadata: SkillMetadata, content: string): string {
    const frontmatter = yaml.dump(metadata, {
      sortKeys: false,
      lineWidth: -1,  // Disable line wrapping
    });

    return `---\n${frontmatter}---\n\n${content}`;
  }

  /**
   * Extract display name from markdown (first H1 header)
   */
  extractDisplayName(content: string): string | null {
    const h1Match = content.match(/^#\s+(.+)$/m);
    return h1Match ? h1Match[1].trim() : null;
  }

  /**
   * Progressive disclosure: extract frontmatter only (Level 1)
   */
  extractFrontmatterOnly(content: string): SkillMetadata {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      throw new Error('Invalid SKILL.md format: Missing YAML frontmatter');
    }

    try {
      return yaml.load(match[1]) as SkillMetadata;
    } catch (error) {
      throw new Error(`Failed to parse YAML frontmatter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Progressive disclosure: extract body without frontmatter (Level 2)
   */
  extractBodyOnly(content: string): string {
    const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
    return content.replace(frontmatterRegex, '').trim();
  }

  /**
   * Validate skill file format
   */
  validateSkillFile(content: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const parsed = this.parseSkillFile(content);
      
      // Check for display name
      const displayName = this.extractDisplayName(parsed.content);
      if (!displayName) {
        errors.push('Missing H1 header for skill display name');
      }

      // Check minimum content length
      if (parsed.content.length < 100) {
        errors.push('Skill content too short (minimum 100 characters)');
      }

      // Validate auto_switch_rules structure
      if (parsed.metadata.auto_switch_rules) {
        const rules = parsed.metadata.auto_switch_rules;
        if (rules.keywords && !Array.isArray(rules.keywords)) {
          errors.push('auto_switch_rules.keywords must be an array');
        }
        if (rules.file_types && !Array.isArray(rules.file_types)) {
          errors.push('auto_switch_rules.file_types must be an array');
        }
      }

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown validation error');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create skill template
   */
  createTemplate(name: string, category: string = 'workflow'): string {
    const metadata: SkillMetadata = {
      name,
      description: 'Describe what this skill does and when to use it.',
      category,
      license: 'MIT',
      learning_enabled: false,
      memory_scope: 'user',
      rag_integration: false,
      version: '1.0.0',
    };

    const body = `# ${this.toDisplayName(name)}

Expert assistant for [specific task]. Use when [trigger conditions].

## Instructions

### Step 1: [Action]

Detailed instructions for the first step...

### Step 2: [Action]

Detailed instructions for the second step...

## Examples

### Example 1: [Scenario]

\`\`\`
User input example
\`\`\`

Expected behavior...

### Example 2: [Scenario]

\`\`\`
Another user input
\`\`\`

Expected behavior...

## Troubleshooting

**Issue**: Common problem
**Solution**: How to resolve

**Issue**: Another problem
**Solution**: Resolution steps
`;

    return this.generateSkillFile(metadata, body);
  }

  /**
   * Convert kebab-case to Title Case
   */
  private toDisplayName(kebabCase: string): string {
    return kebabCase
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

export const skillParserService = new SkillParserService();
