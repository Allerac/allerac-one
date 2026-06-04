// Pure tool definitions — no Node.js/server imports.
// Imported by tools.ts which is bundled for the browser.

export const EMAIL_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_emails',
      description: 'List emails from the user\'s inbox. Call this when the user asks to check their email, see new messages, or wants an overview of their inbox. Returns subject, sender, date, and a snippet for each message.',
      parameters: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: 'Email account ID (omit to use the first/default account)',
          },
          limit: {
            type: 'number',
            description: 'Max number of messages to return (default 20)',
          },
          unread_only: {
            type: 'boolean',
            description: 'If true, return only unread messages',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_email',
      description: 'Read the full content of a specific email by its UID. Use the uid and account_id returned by list_emails. Automatically marks the email as read.',
      parameters: {
        type: 'object',
        properties: {
          uid: {
            type: 'number',
            description: 'The UID of the email to read (from list_emails)',
          },
          account_id: {
            type: 'string',
            description: 'Email account ID (from list_emails)',
          },
        },
        required: ['uid'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Send an email on behalf of the user. Use this when the user asks to reply to, forward, or compose an email. When replying, pass the original message_id as in_reply_to.',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient email address',
          },
          subject: {
            type: 'string',
            description: 'Email subject line',
          },
          body: {
            type: 'string',
            description: 'Plain text body of the email',
          },
          account_id: {
            type: 'string',
            description: 'Email account ID to send from (omit for default)',
          },
          in_reply_to: {
            type: 'string',
            description: 'Message-ID of the email being replied to (for threading)',
          },
          references: {
            type: 'string',
            description: 'References header for email threading',
          },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
];
