# Domain: Design

**Slug:** `design`  
**Route:** `/design`  
**Icon:** 🎨  
**Status:** Active  
**Default Skill:** `design` (`skills/design.md`)

## Purpose

Design system assistant with an interactive vector canvas. The AI can draw wireframes, diagrams, and UI mockups directly in the browser, while also helping with design tokens, component API design, accessibility analysis, and design-to-code workflows.

## Key Files

| Layer | Path |
|-------|------|
| Page (server) | `src/app/design/page.tsx` |
| Client layout | `src/app/design/DesignClient.tsx` |
| Canvas component | `src/app/design/DesignCanvas.tsx` |
| Migration | `src/database/migrations/044_domain_design.sql` |
| Skill | `skills/design.md` |

## Tools Available

| Tool | Description |
|------|-------------|
| `draw_canvas` | Draw shapes, arrows, and text on the vector canvas; supports `replace` and `append` modes |
| `search_web` | Web search (for design system references: Material, Radix, Shadcn, etc.) |
| `read_url` | Fetch and read a URL |
| `get_today_info` | Current date/time |

## Canvas

The `DesignCanvas` component renders SVG-based vector drawings. The AI receives the current canvas dimensions in its system prompt context header and can issue `draw_canvas` calls to replace or append to the drawing.

## External Integrations

None. Uses web search for referencing design systems and component libraries.

## Notes

- Canvas state is kept in client memory during a conversation; it is not persisted to DB.
- The `draw_canvas` tool supports shapes: rectangle, circle, arrow, text, line.
- Useful for quick wireframes and architecture diagrams without leaving the chat.
