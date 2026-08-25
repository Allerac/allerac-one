#!/usr/bin/env node
// Terminal chat client for a locally running Allerac instance.
//
// Talks to the Control API (/api/v1) with a Bearer API key instead of a
// browser session — generate one at /config -> "API Access" with the
// chat:read + chat:write scopes.
//
// Default domain/model come from your account's CLI settings (the "CLI" app
// in the Hub's Start Menu, /cli) via GET /api/v1/me — no env vars needed for
// those day to day. ALLERAC_DOMAIN/ALLERAC_MODEL/ALLERAC_PROVIDER below
// still override them per run when set.
//
// Usage:
//   ALLERAC_API_KEY=allerac_xxx node scripts/allerac-chat.mjs
//   ALLERAC_API_KEY=allerac_xxx ALLERAC_DOMAIN=code node scripts/allerac-chat.mjs
//
// Points at http://localhost:8080 by default — set ALLERAC_API_URL to talk
// to a remote/hosted instance instead:
//   ALLERAC_API_URL=https://allerac.example.com ALLERAC_API_KEY=allerac_xxx node scripts/allerac-chat.mjs
//
// In a real terminal, startup shows an interactive model picker (↑/↓ +
// Enter, Esc to keep the pre-selected default) before the chat opens —
// skipped automatically when ALLERAC_MODEL is set, since that's already an
// explicit choice for this run.
//
// Mid-session commands: "/domains" lists domains you have access to;
// "/domain <slug>" switches to one without restarting (starts a fresh
// conversation there — the server ties one conversation to one domain for
// its lifetime); "/models" lists available models; "/model <id>" overrides
// the model+provider for the rest of this session. "/domains" needs the
// domains:read API key scope; the rest reuse profile:read.
//
// In a real terminal (TTY), the input box is pinned to the bottom of the
// screen via an ANSI scroll region, and the conversation scrolls above it
// like a normal chat log — only the input box has the Allerac-violet border.
// When stdin/stdout isn't a TTY (piped, redirected), falls back to a plain
// line-by-line readline prompt with no fixed positioning.

import readline from 'node:readline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const baseUrl = (process.env.ALLERAC_API_URL || 'http://localhost:8080').replace(/\/$/, '');
const apiKey = process.env.ALLERAC_API_KEY;
const interactive = Boolean(process.stdout.isTTY && process.stdin.isTTY);

// Best-effort — falls back to 0.0.0 if run outside the repo (e.g. copied
// standalone) rather than failing the whole CLI over a cosmetic version tag.
let VERSION = '0.0.0';
try {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(path.join(scriptDir, '..', 'package.json'), 'utf8'));
  VERSION = pkg.version || VERSION;
} catch {
  // non-fatal
}

// Resolved at startup by resolvePreferences() — env vars win when set,
// otherwise fall back to the account's saved CLI settings (/cli), then 'chat'.
let domainSlug = 'chat';
let cliModel;
let cliProvider;

// Allerac brand palette (from the app icon gradient: #6366f1 -> #4c1d95).
const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const bgRgb = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`;
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  white: '\x1b[97m',
  gray: '\x1b[38;5;244m',
  red: '\x1b[38;5;203m',
  indigo: rgb(99, 102, 241),   // #6366f1
  violet: rgb(167, 139, 250),  // #a78bfa — input box rules, exclusively
  userBg: '\x1b[48;5;237m',      // user message background bar
};
const paint = (color, text) => `${color}${text}${c.reset}`;

if (!apiKey) {
  console.error(paint(c.red, 'Missing ALLERAC_API_KEY.'));
  console.error(paint(c.gray, 'Generate one at /config -> "API Access" (scopes: chat:read, chat:write).'));
  process.exit(1);
}

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message || response.statusText;
    throw new Error(`${response.status} ${message}`);
  }
  return body;
}

async function createConversation() {
  const { data } = await api('/api/v1/conversations', {
    method: 'POST',
    body: JSON.stringify({
      title: `CLI session ${new Date().toISOString()}`,
      domainSlug,
    }),
  });
  return data.conversation.id;
}

// Requires the API key to have the domains:read scope.
async function listDomains() {
  const { data } = await api('/api/v1/domains');
  return data.domains;
}

async function listModels() {
  const { data } = await api('/api/v1/models');
  return data.models;
}

async function sendMessage(conversationId, message) {
  // The Control API requires model+provider together or not at all — if only
  // one is set it ignores both and falls back to the domain's configured
  // model, so cliModel/cliProvider (see resolvePreferences) are always
  // resolved as a pair.
  const { data } = await api(`/api/v1/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message, ...(cliModel ? { model: cliModel } : {}), ...(cliProvider ? { provider: cliProvider } : {}) }),
  });
  return data.message.content;
}

// Env vars win when set; otherwise fall back to the account's saved CLI
// settings (/cli in the app), then plain defaults.
async function resolvePreferences() {
  let cliPreferences = {};
  try {
    const { data } = await api('/api/v1/me');
    cliPreferences = data.cliPreferences || {};
  } catch {
    // Non-fatal — proceed with env vars / defaults only. The real API key
    // problem (if any) will surface clearly on the next call anyway.
  }
  domainSlug = process.env.ALLERAC_DOMAIN || cliPreferences.domainSlug || 'chat';
  cliModel = process.env.ALLERAC_MODEL || cliPreferences.modelId || undefined;
  cliProvider = process.env.ALLERAC_PROVIDER || cliPreferences.provider || undefined;
}

// Greedy word-wrap so long AI replies don't run past the terminal width.
function wrapText(text, width) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') { lines.push(''); continue; }
    let current = '';
    for (const word of paragraph.split(' ')) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > width && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    lines.push(current);
  }
  return lines;
}

function formatElapsed(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

// --- Minimal markdown rendering (bold/italic/inline-code/fences/bullets) ---
// Style is tracked as a per-character array over a "plain" (marker-stripped)
// string, so word-wrapping can be done on VISIBLE width — wrapping the raw
// ANSI-coded string directly would count escape bytes as columns.
const STYLE_CODES = { plain: '', bold: c.bold, italic: '\x1b[3m', code: '\x1b[38;5;180m' };

function stripMarkdownInline(raw) {
  let plain = '';
  const styleArr = [];
  const push = (s, style) => { for (const ch of s) { plain += ch; styleArr.push(style); } };
  const regex = /\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|_([^_]+)_/g;
  let lastIndex = 0;
  let m;
  while ((m = regex.exec(raw))) {
    if (m.index > lastIndex) push(raw.slice(lastIndex, m.index), 'plain');
    if (m[1] !== undefined) push(m[1], 'bold');
    else if (m[2] !== undefined) push(m[2], 'bold');
    else if (m[3] !== undefined) push(m[3], 'code');
    else if (m[4] !== undefined) push(m[4], 'italic');
    else if (m[5] !== undefined) push(m[5], 'italic');
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < raw.length) push(raw.slice(lastIndex), 'plain');
  return { plain, styleArr };
}

// Greedy word-wrap over a plain string, returned as [start,end) index ranges
// so styling can be resolved per-range afterwards.
function wrapIndices(text, width) {
  const words = [];
  let wordStart = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === ' ') {
      if (i > wordStart) words.push([wordStart, i]);
      wordStart = i + 1;
    }
  }
  const ranges = [];
  let curStart = null, curEnd = null, curLen = 0;
  for (const [ws, we] of words) {
    const wlen = we - ws;
    const nextLen = curLen === 0 ? wlen : curLen + 1 + wlen;
    if (nextLen > width && curLen > 0) {
      ranges.push([curStart, curEnd]);
      curStart = ws; curEnd = we; curLen = wlen;
    } else {
      if (curStart === null) curStart = ws;
      curEnd = we;
      curLen = nextLen;
    }
  }
  if (curStart !== null) ranges.push([curStart, curEnd]);
  if (ranges.length === 0) ranges.push([0, 0]);
  return ranges;
}

function buildStyledLine(plainText, styleArr, start, end) {
  let out = '';
  let current = null;
  for (let i = start; i < end; i++) {
    const style = styleArr[i] || 'plain';
    if (style !== current) {
      if (current && current !== 'plain') out += c.reset;
      if (style !== 'plain') out += STYLE_CODES[style];
      current = style;
    }
    out += plainText[i];
  }
  if (current && current !== 'plain') out += c.reset;
  return out;
}

function renderProseLine(rawLine, width) {
  const bulletMatch = rawLine.match(/^(\s*)[-*]\s+(.*)$/);
  const headerMatch = rawLine.match(/^#{1,6}\s+(.*)$/);
  const prefix = bulletMatch ? `${bulletMatch[1]}• ` : '';
  const body = bulletMatch ? bulletMatch[2] : headerMatch ? headerMatch[1] : rawLine;

  const { plain, styleArr } = stripMarkdownInline(body);
  if (headerMatch) {
    for (let i = 0; i < styleArr.length; i++) if (styleArr[i] === 'plain') styleArr[i] = 'bold';
  }
  const fullPlain = prefix + plain;
  const fullStyleArr = Array(prefix.length).fill('plain').concat(styleArr);

  return wrapIndices(fullPlain, width).map(([s, e]) => buildStyledLine(fullPlain, fullStyleArr, s, e));
}

// Renders markdown text (bold/italic/code/fences/bullets/headers) into
// wrap-safe, ANSI-styled lines ready to print one per row.
function renderMarkdown(text, width) {
  const lines = [];
  const segments = text.split('```');
  segments.forEach((segment, i) => {
    if (i % 2 === 1) {
      const codeLines = segment.split('\n');
      if (codeLines.length && /^[\w.+-]*$/.test(codeLines[0])) codeLines.shift(); // language tag
      if (codeLines.length && codeLines[codeLines.length - 1] === '') codeLines.pop();
      for (const line of codeLines) lines.push(paint(c.gray, line));
    } else {
      for (const rawLine of segment.split('\n')) {
        if (rawLine === '') { lines.push(''); continue; }
        lines.push(...renderProseLine(rawLine, width));
      }
    }
  });
  return lines;
}

// Compact mountain-peak "A" — echoes the triangular Allerac app icon.
const ALLERAC_GLYPH = [
  '    ███    ',
  '   ██ ██   ',
  '  ██   ██  ',
  ' █████████ ',
  '███     ███',
];

// Truncates in the middle (keeping both ends visible) so a long path like
// C:\Users\...\allerac-one still reads as identifiable inside a narrow box.
function truncateMiddle(str, maxLen) {
  if (str.length <= maxLen) return str;
  if (maxLen <= 1) return str.slice(0, maxLen);
  const headLen = Math.ceil((maxLen - 1) / 2);
  const tailLen = Math.floor((maxLen - 1) / 2);
  return `${str.slice(0, headLen)}…${str.slice(str.length - tailLen)}`;
}

// Boxed startup info panel (à la Codex/Claude Code CLIs): title, then
// label/value rows for the session's domain, model, and working directory.
// Sized to content and capped to the terminal width; recomputed on every
// call so it always reflects the live domainSlug/cliModel (see redraw()).
function buildInfoBox(termWidth, indentWidth) {
  const title = `>_ Allerac CLI (v${VERSION})`;
  const rows = [
    { label: 'domain:', value: domainSlug },
    { label: 'model:', value: cliModel ? `${cliModel}${cliProvider ? ` (${cliProvider})` : ''}` : 'domain default', hint: '/model to change' },
    { label: 'directory:', value: process.cwd() },
  ];
  const labelWidth = Math.max(...rows.map(r => r.label.length));
  const budget = Math.max(20, termWidth - indentWidth - 4); // 4 = both borders + both inner paddings

  const plainRows = rows.map(r => {
    const label = r.label.padEnd(labelWidth);
    let hint = r.hint || '';
    let available = budget - label.length - 1 - (hint ? hint.length + 3 : 0);
    if (hint && available < 8) { hint = ''; available = budget - label.length - 1; } // drop hint first — value wins the remaining space
    available = Math.max(available, 1);
    const value = r.value.length > available ? truncateMiddle(r.value, available) : r.value;
    return { label, value, hint };
  });

  const plainLines = [title, '', ...plainRows.map(r => `${r.label} ${r.value}${r.hint ? `   ${r.hint}` : ''}`)];
  const innerWidth = Math.min(budget, Math.max(...plainLines.map(l => l.length)));
  const pad = (plain) => ' '.repeat(Math.max(0, innerWidth - plain.length));
  const border = (left, right) => paint(c.violet, `${left}${'─'.repeat(innerWidth + 2)}${right}`);
  const side = paint(c.violet, '│');

  const lines = [border('╭', '╮')];
  lines.push(`${side} ${paint(c.bold + c.indigo, title)}${pad(title)} ${side}`);
  lines.push(`${side} ${pad('')} ${side}`);
  for (const r of plainRows) {
    const plain = `${r.label} ${r.value}${r.hint ? `   ${r.hint}` : ''}`;
    const colored = `${paint(c.gray, r.label)} ${r.value}${r.hint ? `   ${paint(c.gray, r.hint)}` : ''}`;
    lines.push(`${side} ${colored}${pad(plain)} ${side}`);
  }
  lines.push(border('╰', '╯'));
  return lines;
}

// Interactive startup picker — arrow keys + Enter to choose the model for
// this session, Esc to keep whatever resolvePreferences() already resolved.
// Runs on the normal screen buffer (before the alternate-screen chat UI
// takes over), so it just clears itself when done rather than restoring
// anything. Non-fatal on any failure — worst case the pre-resolved default
// from resolvePreferences() is used, same as before this existed.
async function pickModelInteractive() {
  let models;
  try {
    models = await listModels();
  } catch {
    return;
  }
  if (!models.length) return;

  const options = [
    { id: null, provider: null, plainLabel: "— domain's configured model —" },
    ...models.map(m => ({ id: m.id, provider: m.provider, plainLabel: `${m.name} (${m.provider})` })),
  ];
  let selected = Math.max(0, options.findIndex(o => o.id === (cliModel || null)));

  const write = (s) => process.stdout.write(s);
  const maxWidth = Math.max(24, (process.stdout.columns || 80) - 6);

  // Box geometry is fixed for the picker's lifetime (no resize handling here),
  // so re-render doesn't need a full-screen clear — it just overwrites the
  // same rows in place. Redrawing via one batched write (instead of one
  // write() syscall per line, with a full \x1b[2J wipe in front) is what
  // keeps arrow-key navigation feeling instant instead of visibly flickering.
  function render() {
    const title = 'Select a model';
    const rowLabels = options.map(o => truncateMiddle(o.plainLabel, maxWidth));
    const innerWidth = Math.max(title.length, ...rowLabels.map(l => l.length + 2));
    const side = paint(c.violet, '│');
    const border = (l, r) => paint(c.violet, `${l}${'─'.repeat(innerWidth + 2)}${r}`);

    const lines = [`  ${border('╭', '╮')}`];
    lines.push(`  ${side} ${paint(c.bold + c.indigo, title)}${' '.repeat(innerWidth - title.length)} ${side}`);
    rowLabels.forEach((label, i) => {
      const marker = i === selected ? paint(c.violet, '› ') : '  ';
      const text = i === selected ? paint(c.bold, label) : label;
      lines.push(`  ${side} ${marker}${text}${' '.repeat(innerWidth - 2 - label.length)} ${side}`);
    });
    lines.push(`  ${border('╰', '╯')}`);
    lines.push('');
    lines.push(`  ${paint(c.gray, '↑↓ navigate · Enter confirm · Esc keep default')}`);

    write(lines.map((line, i) => `\x1b[${i + 1};1H\x1b[2K${line}`).join(''));
  }

  write('\x1b[2J\x1b[H\x1b[?25l'); // one-time clear + hide cursor; render() only touches its own rows from here on
  render();

  await new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (chunk) => {
      if (chunk === '\x03') { // Ctrl+C
        write('\x1b[?25h');
        process.exit(0);
      } else if (chunk === '\x1b[A' || chunk === '\x1bOA') {
        selected = (selected - 1 + options.length) % options.length;
        render();
      } else if (chunk === '\x1b[B' || chunk === '\x1bOB') {
        selected = (selected + 1) % options.length;
        render();
      } else if (chunk === '\r' || chunk === '\n') {
        finish(options[selected]);
      } else if (chunk === '\x1b') { // plain Esc — arrow sequences are matched whole above
        finish(null);
      }
    };
    const finish = (choice) => {
      process.stdin.off('data', onData);
      write('\x1b[?25h\x1b[2J\x1b[H');
      if (choice) { cliModel = choice.id; cliProvider = choice.provider; }
      resolve();
    };
    process.stdin.on('data', onData);
  });
}

const COMMANDS = [
  { cmd: '/domains', hint: 'list domains you can access' },
  { cmd: '/domain', hint: '<slug>  switch domain' },
  { cmd: '/models', hint: 'list available models' },
  { cmd: '/model', hint: '<id>  switch model for this session' },
];

// ---------------------------------------------------------------------------
// Interactive TUI: only the input bar is pinned to the bottom of the screen
// (outside the DECSTBM scroll region). The logo/header is printed as the
// first lines of the scrolling transcript itself — visible while the
// conversation is short, and scrolling away with everything else once
// enough messages push it past the top of the screen (recoverable via the
// terminal's own scrollback, same as any other line).
// ---------------------------------------------------------------------------
async function runInteractive() {
  const write = (s) => process.stdout.write(s);
  const PALETTE_HEIGHT = COMMANDS.length; // reserved rows for the "/" command palette
  const FOOTER_HEIGHT = PALETTE_HEIGHT + 5; // palette, status line, margin, rule, input line, rule
  const HEADER_INDENT = '  '; // left-aligned, not centered
  let rows = process.stdout.rows;
  let cols = process.stdout.columns;
  let scrollBottom = rows - FOOTER_HEIGHT;
  let inputBuffer = '';
  // Next row to write within the scroll region. Content fills top-down from
  // row 1 while there's room; only once it reaches scrollBottom does writing
  // further lines actually scroll the region (see appendLine).
  let contentRow = 1;

  const setScrollRegion = () => write(`\x1b[1;${scrollBottom}r`);
  const resetScrollRegion = () => write('\x1b[r');

  function printHeader() {
    for (const line of ALLERAC_GLYPH) appendLine(`${HEADER_INDENT}${paint(c.violet, line)}`);
    appendLine();
    for (const line of buildInfoBox(cols, HEADER_INDENT.length)) appendLine(`${HEADER_INDENT}${line}`);
    appendLine(`${HEADER_INDENT}${paint(c.gray, `${baseUrl} · Type / for commands · Ctrl+C to quit`)}`);
    appendLine();
  }

  // Rows below the scroll region, bottom-up: rule / input / rule (the box),
  // a blank margin row, a status row, then the "/" command palette on top —
  // all always stuck to the box regardless of how much has scrolled above.
  const paletteTopRow = () => scrollBottom + 1;
  const statusRow = () => scrollBottom + 1 + PALETTE_HEIGHT;
  const marginRow = () => statusRow() + 1;

  function drawBox() {
    const rule = paint(c.violet, '─'.repeat(cols));
    write(`\x1b[${marginRow()};1H\x1b[2K`);
    write(`\x1b[${marginRow() + 1};1H\x1b[2K${rule}`);
    write(`\x1b[${marginRow() + 3};1H\x1b[2K${rule}`);
    drawInputLine();
  }

  function drawPalette() {
    const spaceIndex = inputBuffer.indexOf(' ');
    const typingCommand = inputBuffer.startsWith('/') && spaceIndex === -1;
    const query = typingCommand ? inputBuffer.slice(1).toLowerCase() : null;
    const matches = typingCommand ? COMMANDS.filter(c => c.cmd.slice(1).startsWith(query)) : [];

    for (let i = 0; i < PALETTE_HEIGHT; i++) {
      const row = paletteTopRow() + i;
      let text = '';
      if (typingCommand && matches.length === 0 && i === 0) {
        text = paint(c.gray, 'No matching commands');
      } else if (matches[i]) {
        text = `${' '.repeat(MARKER_WIDTH)}${paint(c.violet, matches[i].cmd)} ${paint(c.gray, matches[i].hint)}`;
      }
      write(`\x1b[${row};1H\x1b[2K${text}`);
    }
  }

  function drawInputLine() {
    const row = marginRow() + 2;
    write(`\x1b[${row};1H\x1b[2K${paint(c.violet, '❯︎')} ${inputBuffer}`);
    drawPalette();
    // drawPalette() writes to other rows and leaves the terminal cursor
    // there — bring it back to the input line, right after the typed text,
    // so the blinking cursor tracks what you're actually typing.
    write(`\x1b[${row};${inputBuffer.length + 3}H`);
  }

  // Appends one line to the scrolling transcript region. While there's still
  // unused space, this just fills the next row downward (top-anchored, like
  // normal terminal output). Once the region is full, writing at the bottom
  // margin followed by a real LF scrolls everything up by one line.
  function appendLine(text = '') {
    write(`\x1b[${contentRow};1H\x1b[2K${text}`);
    if (contentRow < scrollBottom) {
      contentRow += 1;
    } else {
      write('\r\n');
    }
  }

  // Market-standard turn markers: "> " for the user, "● " for Allerac — the
  // marker only leads the first line; wrapped continuation lines align under
  // it with a matching blank indent instead of repeating the glyph.
  const MARKER_WIDTH = 2; // e.g. "> " or "● "
  function appendMarkedMessage(lines, marker) {
    lines.forEach((line, i) => {
      appendLine(`${i === 0 ? marker : ' '.repeat(MARKER_WIDTH)}${line}`);
    });
  }

  // Full-width light-lilac background bar, dark-indigo text for contrast on
  // any terminal theme, with the "> " marker baked into the same bar.
  function appendUserMessage(text, width) {
    wrapText(text, width - MARKER_WIDTH).forEach((line, i) => {
      const prefix = i === 0 ? '> ' : ' '.repeat(MARKER_WIDTH);
      const raw = `${prefix}${line}`;
      const padded = raw.length < width ? raw + ' '.repeat(width - raw.length) : raw;
      appendLine(`${c.userBg}${padded}${c.reset}`);
    });
  }

  // Turn history, kept purely so a resize can fully replay the transcript
  // (see redraw) — old terminal content can't be reflowed to new geometry.
  const history = [];

  function renderUserTurn(text) {
    appendUserMessage(text, cols);
    appendLine();
  }
  function renderAssistantTurn(text, elapsedMs) {
    appendMarkedMessage(renderMarkdown(text, cols - MARKER_WIDTH), `${paint(c.white, '●︎')} `);
    appendLine();
    appendLine(`${paint(c.indigo, '✦︎')} ${paint(c.gray, `Alleracked in ${formatElapsed(elapsedMs)}`)}`);
    appendLine();
  }
  function renderErrorTurn(text) {
    appendLine(`${' '.repeat(MARKER_WIDTH)}${paint(c.red, `✖ ${text}`)}`);
    appendLine();
  }
  function renderSystemTurn(text) {
    for (const line of text.split('\n')) {
      appendLine(`${' '.repeat(MARKER_WIDTH)}${paint(c.gray, line)}`);
    }
    appendLine();
  }
  function replayHistory() {
    for (const entry of history) {
      if (entry.role === 'user') renderUserTurn(entry.text);
      else if (entry.role === 'assistant') renderAssistantTurn(entry.text, entry.elapsedMs);
      else if (entry.role === 'system') renderSystemTurn(entry.text);
      else renderErrorTurn(entry.text);
    }
  }

  // "/domain <slug>" switches domains mid-session by starting a fresh
  // conversation there — the Control API ties a conversation to one domain
  // for its lifetime, so there's no in-place switch on the server side.
  async function switchDomain(newSlug) {
    const previous = domainSlug;
    try {
      domainSlug = newSlug;
      conversationId = await createConversation();
      const text = `Switched to domain "${domainSlug}" — new conversation started.`;
      history.push({ role: 'system', text });
      renderSystemTurn(text);
    } catch (error) {
      domainSlug = previous;
      history.push({ role: 'error', text: error.message });
      renderErrorTurn(error.message);
    }
  }

  // "/model <id>" sets cliModel/cliProvider for the rest of this session only
  // (like /domain, it doesn't touch the persisted /cli defaults).
  async function switchModel(target) {
    try {
      const models = await listModels();
      const match = models.find(m => m.id === target || m.id.toLowerCase() === target.toLowerCase());
      if (!match) {
        renderErrorTurn(`Unknown model "${target}". Run /models to see the available ids.`);
        return;
      }
      cliModel = match.id;
      cliProvider = match.provider;
      const text = `Model set to "${cliModel}" (${cliProvider}) for this session.`;
      history.push({ role: 'system', text });
      renderSystemTurn(text);
    } catch (error) {
      history.push({ role: 'error', text: error.message });
      renderErrorTurn(error.message);
    }
  }

  // On resize (including font zoom, which changes the character grid), old
  // terminal content can't be reliably reflowed to the new geometry — a
  // shrunk scroll region in particular would leave stale rows behind as
  // visual garbage. Full-clear and replay the whole transcript instead.
  function redraw() {
    rows = process.stdout.rows;
    cols = process.stdout.columns;
    scrollBottom = rows - FOOTER_HEIGHT;
    write('\x1b[2J\x1b[H');
    setScrollRegion();
    contentRow = 1;
    printHeader();
    replayHistory();
    drawBox();
  }

  function cleanup() {
    resetScrollRegion();
    write('\x1b[?25h');   // show cursor
    write('\x1b[?1049l'); // leave the alternate screen — instantly restores whatever was on screen before
  }

  // The alternate screen buffer has no scrollback of its own, so the
  // terminal's viewport can never pan away from what we draw — this is what
  // keeps the input box permanently visible, the same trick vim/htop/less use.
  write('\x1b[?1049h');
  redraw();

  process.stdout.on('resize', redraw);

  let conversationId = await createConversation();

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  let sending = false;
  let spinnerTimer = null;
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinnerFrame = 0;

  function startSpinner(startedAt) {
    spinnerTimer = setInterval(() => {
      const elapsed = formatElapsed(Date.now() - startedAt);
      write(`\x1b[${statusRow()};1H\x1b[2K${paint(c.indigo, spinnerFrames[spinnerFrame = (spinnerFrame + 1) % spinnerFrames.length])} ${paint(c.gray, `Alleracking… ${elapsed}`)}`);
    }, 80);
  }
  function stopSpinner() {
    clearInterval(spinnerTimer);
    write(`\x1b[${statusRow()};1H\x1b[2K`);
  }

  async function submit(message) {
    if (!message || sending) return;
    inputBuffer = '';
    drawInputLine();

    if (/^\/domains$/i.test(message)) {
      sending = true;
      try {
        const domains = await listDomains();
        const text = ['Available domains:', ...domains.map(dom => (
          `${dom.slug === domainSlug ? '●' : ' '} ${dom.slug}${dom.displayName && dom.displayName !== dom.slug ? ` — ${dom.displayName}` : ''}`
        ))].join('\n');
        history.push({ role: 'system', text });
        renderSystemTurn(text);
      } catch (error) {
        history.push({ role: 'error', text: error.message });
        renderErrorTurn(error.message);
      }
      sending = false;
      drawInputLine();
      return;
    }

    const domainCommand = message.match(/^\/domain(?:\s+(\S+))?$/i);
    if (domainCommand) {
      sending = true;
      const target = domainCommand[1];
      if (target) await switchDomain(target);
      else renderSystemTurn(`Current domain: "${domainSlug}"`);
      sending = false;
      drawInputLine();
      return;
    }

    if (/^\/models$/i.test(message)) {
      sending = true;
      try {
        const models = await listModels();
        const text = ['Available models:', ...models.map(m => (
          `${m.id === cliModel ? '●' : ' '} ${m.id} — ${m.name} (${m.provider})`
        ))].join('\n');
        history.push({ role: 'system', text });
        renderSystemTurn(text);
      } catch (error) {
        history.push({ role: 'error', text: error.message });
        renderErrorTurn(error.message);
      }
      sending = false;
      drawInputLine();
      return;
    }

    const modelCommand = message.match(/^\/model(?:\s+(\S+))?$/i);
    if (modelCommand) {
      sending = true;
      const target = modelCommand[1];
      if (target) await switchModel(target);
      else renderSystemTurn(cliModel ? `Current model: "${cliModel}" (${cliProvider})` : 'Current model: domain default (no override set)');
      sending = false;
      drawInputLine();
      return;
    }

    history.push({ role: 'user', text: message });
    renderUserTurn(message);

    sending = true;
    const startedAt = Date.now();
    startSpinner(startedAt);
    try {
      const reply = await sendMessage(conversationId, message);
      stopSpinner();
      const elapsedMs = Date.now() - startedAt;
      history.push({ role: 'assistant', text: reply, elapsedMs });
      renderAssistantTurn(reply, elapsedMs);
    } catch (error) {
      stopSpinner();
      history.push({ role: 'error', text: error.message });
      renderErrorTurn(error.message);
    }
    sending = false;
    drawInputLine();
  }

  process.stdin.on('data', (chunk) => {
    for (const char of chunk) {
      if (char === '\x03') { // Ctrl+C
        cleanup();
        process.exit(0);
      } else if (char === '\r' || char === '\n') {
        const message = inputBuffer.trim();
        submit(message);
      } else if (char === '\x7f' || char === '\b') { // Backspace
        inputBuffer = inputBuffer.slice(0, -1);
        drawInputLine();
      } else if (char >= ' ') { // printable
        inputBuffer += char;
        drawInputLine();
      }
    }
  });

  process.on('exit', cleanup);
}

// ---------------------------------------------------------------------------
// Plain fallback for non-TTY environments (piped/redirected stdio).
// ---------------------------------------------------------------------------
async function runPlain() {
  console.log(`Allerac CLI (v${VERSION}) — ${baseUrl}`);
  console.log(`domain:    ${domainSlug}`);
  console.log(`model:     ${cliModel ? `${cliModel} (${cliProvider})` : 'domain default'}`);
  console.log(`directory: ${process.cwd()}`);
  let conversationId = await createConversation();
  console.log(`Conversation ${conversationId} started. Type your message, "/domains" to list, "/domain <slug>" to switch, or "exit" to quit.\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'you> ' });
  rl.prompt();

  rl.on('line', async (line) => {
    const message = line.trim();
    if (!message) { rl.prompt(); return; }
    if (['exit', 'quit'].includes(message.toLowerCase())) { rl.close(); return; }

    if (/^\/domains$/i.test(message)) {
      try {
        const domains = await listDomains();
        console.log(`\nAvailable domains:`);
        for (const dom of domains) {
          const marker = dom.slug === domainSlug ? '*' : ' ';
          console.log(`${marker} ${dom.slug}${dom.displayName && dom.displayName !== dom.slug ? ` — ${dom.displayName}` : ''}`);
        }
        console.log('');
      } catch (error) {
        console.error(`\n[error] ${error.message}\n`);
      }
      rl.prompt();
      return;
    }

    const domainCommand = message.match(/^\/domain(?:\s+(\S+))?$/i);
    if (domainCommand) {
      if (domainCommand[1]) {
        domainSlug = domainCommand[1];
        try {
          conversationId = await createConversation();
          console.log(`\nSwitched to domain "${domainSlug}" — new conversation started.\n`);
        } catch (error) {
          console.error(`\n[error] ${error.message}\n`);
        }
      } else {
        console.log(`\nCurrent domain: "${domainSlug}"\n`);
      }
      rl.prompt();
      return;
    }

    if (/^\/models$/i.test(message)) {
      try {
        const models = await listModels();
        console.log(`\nAvailable models:`);
        for (const m of models) {
          const marker = m.id === cliModel ? '*' : ' ';
          console.log(`${marker} ${m.id} — ${m.name} (${m.provider})`);
        }
        console.log('');
      } catch (error) {
        console.error(`\n[error] ${error.message}\n`);
      }
      rl.prompt();
      return;
    }

    const modelCommand = message.match(/^\/model(?:\s+(\S+))?$/i);
    if (modelCommand) {
      if (modelCommand[1]) {
        try {
          const models = await listModels();
          const match = models.find(m => m.id.toLowerCase() === modelCommand[1].toLowerCase());
          if (!match) {
            console.error(`\n[error] Unknown model "${modelCommand[1]}". Run /models to see the available ids.\n`);
          } else {
            cliModel = match.id;
            cliProvider = match.provider;
            console.log(`\nModel set to "${cliModel}" (${cliProvider}) for this session.\n`);
          }
        } catch (error) {
          console.error(`\n[error] ${error.message}\n`);
        }
      } else {
        console.log(cliModel ? `\nCurrent model: "${cliModel}" (${cliProvider})\n` : '\nCurrent model: domain default (no override set)\n');
      }
      rl.prompt();
      return;
    }

    try {
      const reply = await sendMessage(conversationId, message);
      console.log(`\nallerac> ${reply}\n`);
    } catch (error) {
      console.error(`\n[error] ${error.message}\n`);
    }
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('Bye!');
    process.exit(0);
  });
}

async function main() {
  await resolvePreferences();
  if (interactive && !process.env.ALLERAC_MODEL) await pickModelInteractive();
  return interactive ? runInteractive() : runPlain();
}

main().catch((error) => {
  console.error(`[fatal] ${error.message}`);
  process.exit(1);
});
