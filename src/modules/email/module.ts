import { defineModule } from '../types';

// Code still lives in src/app/{email,services/email} and src/app/tools/email.tool*.ts.
export default defineModule({
  id: 'email',
  group: 'personal',
  description: 'Email inbox (IMAP/SMTP, Gmail) with AI assistance.',
  domains: ['email'],
  nav: [{ key: 'email', name: 'Email', icon: '✉️', path: '/email' }],
  tools: ['list_emails', 'read_email', 'send_email'],
  skills: [],
  requiredEnv: [],
});
