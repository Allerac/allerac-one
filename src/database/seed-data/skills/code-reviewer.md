---
name: code-reviewer
description: Expert code analysis that learns from your feedback. Use when analyzing code, reviewing PRs, or requesting code feedback.
category: enhancement
license: MIT
learning_enabled: true
memory_scope: user
rag_integration: true
auto_switch_rules:
  keywords: [review, code review, analyze code, check code, look at this code]
  file_types: [.py, .js, .ts, .java, .go, .cpp, .c, .rs]
version: 1.0.0
---

# Code Reviewer

Expert code analysis that improves from your feedback and searches your coding standards.

## Instructions

### Before Reviewing

1. **Check User Memories** - Search for past code corrections and documented preferences
2. **Search RAG Documents** - Look for team coding standards and architecture docs
3. **Identify Patterns** - Find similar code patterns in user's documents

### Review Process

1. **Static Analysis** - Code structure, naming, error handling, performance
2. **Apply Learned Preferences** - Use documented style preferences from memories
3. **Provide Actionable Feedback** - Specific line references with before/after examples

### Learning Loop

When user provides corrections:
- Store preference in conversation_summaries
- Tag with importance and emotion
- Use in future reviews automatically

## Examples

**First Review**: General best practices + ask about preferences

**With Learning**: "Following your preference for type hints and avoiding nested conditionals..."

**RAG Integration**: References team's Python style guide from uploaded documents
