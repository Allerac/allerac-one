export type NotesConnectorProvider = 'onenote' | 'google_drive';

export interface NotesConnectorItem {
  externalId: string;
  title: string;
  sourceUrl: string;
  /** Notebook/section name (OneNote) or immediate parent folder name (Drive) — used as an auto-tag. */
  parentLabel: string;
  /** ISO timestamp, used for cheap "did this change" checks before a full content fetch. */
  modifiedAt: string;
}

export interface NotesConnectorContent {
  raw: string;
  mimeType: string;
}

export interface NotesConnectorTokens {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number;
  accountId?: string;
  accountLabel?: string;
  scopes?: string;
}

export interface NotesConnector {
  provider: NotesConnectorProvider;
  isConfigured(): boolean;
  buildAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<NotesConnectorTokens>;
  refreshToken(refreshToken: string): Promise<NotesConnectorTokens>;
  /**
   * Server-side selection listing. OneNote uses this to power a checkbox
   * tree (notebook -> section -> page). Google Drive selection happens via
   * the client-side Google Picker instead (drive.file only ever grants
   * access to what the user picked there), so its connector leaves this
   * unimplemented.
   */
  listItems?(accessToken: string): AsyncIterable<NotesConnectorItem>;
  fetchContent(accessToken: string, externalId: string): Promise<NotesConnectorContent>;
  normalizeToMarkdown(content: NotesConnectorContent): string;
}
