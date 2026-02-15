# Bot Skills System - Design Document

## 🎯 Overview

**Skills** system configurable per bot, allowing each Telegram bot to have unique personality, capabilities, and behaviors. Each user can have multiple specialized bots for different contexts.

## 💡 Concept

Imagine having:
- **@allerac_assistant_bot** - Personal assistant for calendar and tasks
- **@allerac_research_bot** - Academic researcher with web search
- **@allerac_code_bot** - Code reviewer and debugging expert
- **@allerac_teacher_bot** - Didactic tutor with practical examples
- **@allerac_creative_bot** - Creative writer and storytelling

Each bot has **Skills** that define its capabilities and personality.

## 🏗️ Architecture

### 1. Database Schema

```sql
-- Skills table (predefined or custom)
CREATE TABLE bot_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  icon VARCHAR(50), -- emoji or icon name
  is_public BOOLEAN DEFAULT false, -- public skills = everyone can use
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_skill_name UNIQUE(name)
);

-- Skill-specific configurations
CREATE TABLE bot_skill_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID REFERENCES bot_skills(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL, -- e.g., "temperature", "max_tokens", "model"
  value TEXT NOT NULL,
  CONSTRAINT unique_skill_key UNIQUE(skill_id, key)
);

-- Tools enabled per skill
CREATE TABLE bot_skill_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID REFERENCES bot_skills(id) ON DELETE CASCADE,
  tool_name VARCHAR(100) NOT NULL, -- "web_search", "code_interpreter", etc
  enabled BOOLEAN DEFAULT true,
  config JSONB, -- tool-specific configurations
  CONSTRAINT unique_skill_tool UNIQUE(skill_id, tool_name)
);

-- Link skills to bots
CREATE TABLE telegram_bot_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_config_id UUID REFERENCES telegram_bot_configs(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES bot_skills(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT false, -- skill active by default
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_bot_skill UNIQUE(bot_config_id, skill_id)
);

-- Add skill_id to conversations for tracking
ALTER TABLE telegram_chat_mapping ADD COLUMN active_skill_id UUID REFERENCES bot_skills(id);
```

### 2. Predefined Skills

```typescript
// src/app/constants/bot-skills.ts
export const PREDEFINED_SKILLS = [
  {
    name: "Personal Assistant",
    icon: "📅",
    description: "Manages calendar, reminders and personal tasks",
    systemPrompt: `You are an efficient and organized personal assistant. 
    Your specialties:
    - Organize tasks and priorities
    - Create reminders and schedules
    - Summarize important information
    - Maintain lists and notes
    
    Be concise, direct and always ask for necessary details to organize well.`,
    config: {
      temperature: 0.7,
      max_tokens: 500,
      preferredModel: "gpt-4o-mini"
    },
    tools: ["reminders", "notes"]
  },
  
  {
    name: "Research Assistant",
    icon: "🔬",
    description: "Academic research and information analysis",
    systemPrompt: `You are a rigorous academic researcher.
    Your specialties:
    - Search for verified information on the web
    - Analyze papers and articles
    - Create academic summaries
    - Cite sources correctly
    
    Always cite sources, be critical with information and explain complex concepts.`,
    config: {
      temperature: 0.3,
      max_tokens: 2000,
      preferredModel: "gpt-4o"
    },
    tools: ["web_search", "document_analysis"]
  },
  
  {
    name: "Code Reviewer",
    icon: "💻",
    description: "Code analysis and debugging",
    systemPrompt: `You are a senior software engineer expert in code review.
    Your specialties:
    - Review code and suggest improvements
    - Identify bugs and vulnerabilities
    - Explain programming concepts
    - Suggest refactorings and patterns
    
    Be technical but didactic. Use code examples. Focus on quality and best practices.`,
    config: {
      temperature: 0.2,
      max_tokens: 3000,
      preferredModel: "gpt-4o"
    },
    tools: ["code_interpreter", "syntax_analysis"]
  },
  
  {
    name: "Creative Writer",
    icon: "✍️",
    description: "Creative writing and storytelling",
    systemPrompt: `You are a talented creative writer.
    Your specialties:
    - Create engaging stories
    - Develop characters
    - Write natural dialogues
    - Adapt literary styles
    
    Be imaginative, descriptive and engaging. Ask about genre and tone preferences.`,
    config: {
      temperature: 0.9,
      max_tokens: 2000,
      preferredModel: "gpt-4o"
    },
    tools: []
  },
  
  {
    name: "Language Tutor",
    icon: "🎓",
    description: "Language teaching with practical exercises",
    systemPrompt: `You are an experienced and patient language teacher.
    Your specialties:
    - Explain grammar clearly
    - Create practical exercises
    - Correct mistakes gently
    - Teach contextualized vocabulary
    
    Adapt to the student's level. Use practical examples. Always encourage.`,
    config: {
      temperature: 0.7,
      max_tokens: 1500,
      preferredModel: "gpt-4o-mini"
    },
    tools: ["translation", "pronunciation"]
  },
  
  {
    name: "Fitness Coach",
    icon: "💪",
    description: "Workouts and fitness guidance",
    systemPrompt: `You are a certified personal trainer.
    Your specialties:
    - Create personalized workout plans
    - Guide about exercises
    - Give basic nutrition tips
    - Motivate and track progress
    
    Be motivating but realistic. Always prioritize safety. Adapt to the student's level.`,
    config: {
      temperature: 0.8,
      max_tokens: 1000,
      preferredModel: "gpt-4o-mini"
    },
    tools: ["workout_planner", "calorie_calculator"]
  }
];
```

### 3. Service Layer

```typescript
// src/app/services/skills/bot-skills.service.ts
export class BotSkillsService {
  
  /**
   * Get all skills available for a user (public + owned)
   */
  static async getAvailableSkills(userId: string): Promise<BotSkill[]> {
    // Public skills + user's custom skills
  }
  
  /**
   * Create custom skill
   */
  static async createCustomSkill(
    userId: string,
    name: string,
    systemPrompt: string,
    config: SkillConfig,
    tools: string[]
  ): Promise<BotSkill> {
    // Create skill + configs + tools
  }
  
  /**
   * Assign skill to bot
   */
  static async assignSkillToBot(
    botConfigId: string,
    skillId: string,
    isDefault: boolean = false
  ): Promise<void> {
    // Link skill to bot
  }
  
  /**
   * Get active skill for conversation
   */
  static async getActiveSkill(
    conversationId: string
  ): Promise<BotSkill | null> {
    // Get current skill or default
  }
  
  /**
   * Switch skill in conversation
   */
  static async switchSkill(
    conversationId: string,
    skillId: string
  ): Promise<void> {
    // Update active skill
  }
  
  /**
   * Get bot's skills
   */
  static async getBotSkills(
    botConfigId: string
  ): Promise<BotSkill[]> {
    // All skills assigned to bot
  }
}
```

### 4. Telegram Commands

```typescript
// New bot commands
/skills - List bot's available skills
/skill <name> - Activate a specific skill
/skill_info - Show current skill info
```

#### Usage Example:

```
User: /skills

Bot:
📋 *Available Skills:*

📅 Personal Assistant (active)
🔬 Research Assistant
💻 Code Reviewer
✍️ Creative Writer

Use /skill <name> to switch
```

```
User: /skill Research Assistant

Bot:
🔬 *Research Assistant activated!*

I'm now your academic research assistant. I can:
• Search the web for verified information
• Analyze papers and articles
• Create academic summaries
• Cite sources properly

How can I help with your research?
```

### 5. UI Components

#### TelegramBotSettings.tsx - New Section

```tsx
// Add Skills section when editing/creating bot
<div>
  <h4>Skills</h4>
  
  {/* Available skills */}
  <div className="skills-library">
    {availableSkills.map(skill => (
      <SkillCard
        key={skill.id}
        skill={skill}
        assigned={botSkills.includes(skill.id)}
        onToggle={() => toggleSkill(skill.id)}
        onSetDefault={() => setDefaultSkill(skill.id)}
      />
    ))}
  </div>
  
  {/* Create custom skill */}
  <button onClick={openCustomSkillModal}>
    + Create Custom Skill
  </button>
</div>
```

#### SkillsLibrary.tsx - Skills Modal

```tsx
export function SkillsLibrary({ userId, onClose }) {
  // Browse, search, create skills
  // Drag & drop to reorder
  // Preview each skill
}
```

## 🎨 UX Flow

### For Users

1. **Create Bot**
   - Name: "My Assistant"
   - Token: ...
   - **Skills**: Select "Personal Assistant" + "Research Assistant"
   - Default: "Personal Assistant"

2. **In Telegram**
   ```
   User: /start
   Bot: Hi! I'm your Personal Assistant 📅
   
   User: I need to research something academic
   Bot: Try /skill Research Assistant for academic research!
   
   User: /skill Research Assistant
   Bot: 🔬 Research mode activated!
   
   User: What is quantum computing?
   Bot: [response with web search, citing sources]
   ```

3. **Switch Skill Mid-Conversation**
   ```
   User: Now I want code help
   Bot: Switching to Code Reviewer... 💻
   ```

## 🔧 Phased Implementation

### Phase 1: Foundation (MVP)
- [ ] Database schema
- [ ] Basic BotSkillsService
- [ ] Integrate skill system prompt into chat handler
- [ ] Commands `/skills` and `/skill <name>`
- [ ] UI: add skills when creating/editing bot
- [ ] Seed with 3 basic skills (Assistant, Researcher, Coder)

### Phase 2: Tools Integration
- [ ] Tools system per skill
- [ ] Enable/disable tools dynamically
- [ ] Web search only in skills that allow it
- [ ] Skill-specific tool configs

### Phase 3: Custom Skills
- [ ] UI to create custom skills
- [ ] System prompt editor with preview
- [ ] Configure temperature, max_tokens, model
- [ ] Select available tools
- [ ] Share skills between users

### Phase 4: Advanced Features
- [ ] Skill contexts (skill-specific memory)
- [ ] Analytics per skill (most used, performance)
- [ ] Skill marketplace (users share)
- [ ] Auto-switch skill (AI detects context)
- [ ] Multi-skill conversations (combine skills)

## 📊 Benefits

### For Users
- 🎯 **Specialization**: Right bot for each task
- 🔄 **Flexibility**: Switch context quickly
- ⚙️ **Customization**: Create custom skills
- 🚀 **Productivity**: No need to explain context every time

### For the Product
- 💎 **Differentiation**: Unique feature in the market
- 📈 **Engagement**: Users create multiple bots
- 🎓 **Learning**: Data about most used skills
- 💰 **Monetization**: Premium skills, templates, marketplace

## 🎯 Success Metrics

- **Adoption**: % of users with 2+ skills per bot
- **Switches**: Frequency of skill switching
- **Custom Skills**: % of users creating own skills
- **Retention**: Do skills increase retention?
- **Popular Skills**: Which skills are most used?

## 🔮 Future Vision

### Skill Chaining
```
User: Research about X and then create code for Y

Bot: 
1. [Research Assistant] Researching about X...
2. [Code Reviewer] Creating code for Y based on research...
```

### Skill Templates
- Library of popular skill templates
- One-click installation
- Community-driven

### Skill Marketplace
- Users sell custom skills
- Rating and reviews
- Revenue share

### AI-Powered Skill Routing
```
User: Need help with a bug in my Python code

Bot: [Auto-detects → switches to Code Reviewer]
💻 Code Reviewer here! Show me the code.
```

## 🚀 Next Steps

1. **Design Review**: Validate schema and architecture
2. **POC**: Implement Phase 1 in 2-3 days
3. **User Testing**: Test with 5 early adopters
4. **Iterate**: Adjust based on feedback
5. **Launch**: Release Phase 1 to everyone

---

**Status**: 📝 Design Draft
**Owner**: Gianclaudio + Copilot
**Created**: 2026-02-15
**Last Updated**: 2026-02-15

*"The right tool for the right job, instantly."* 🎯
