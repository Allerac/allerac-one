# Spec: Skills Service

**File:** `src/app/services/skills/skills.service.ts`
**Priority:** 🟡 High — auto-switch logic is complex and easy to break silently

## What to mock
- DB client — return controlled skill rows
- `LLMService` — for `shouldAutoActivate` if it uses LLM to evaluate rules

## `getActiveSkill(conversationId)`
- Returns the currently active skill for a conversation
- Returns null if none active

## `activateSkill(...)`
- Sets skill as active for the conversation
- Records activation reason and trigger message
- Replaces any previously active skill (only one active at a time)

## `shouldAutoActivate(skill, context)`
- Returns true when message matches skill's `auto_switch_rules`
- Returns false when message does not match
- Returns false when skill has no `auto_switch_rules`
- Does not throw if `auto_switch_rules` is malformed

## `getEnrichedSkillContent(skillId, userId, message)`
- Returns skill content string for injection into system message
- Includes any dynamic context relevant to the message
- Does not throw if skill content is empty

## `getDefaultUserSkill(userId)` / `getDefaultBotSkill(botId)`
- Returns the skill marked as default for the user/bot
- Returns null if no default is set

## Auto-switch integration (via chat-handler spec)
- Only one skill active at a time — switching deactivates previous
- Auto-switch does not trigger if the message skill is already active
- Auto-switch checks all available skills, stops at first match
