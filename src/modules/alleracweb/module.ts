import { defineModule } from '../types';

// Public-facing, text-only domain. Code still lives in src/app/alleracweb and skills/alleracweb.md.
export default defineModule({
  id: 'alleracweb',
  group: 'external',
  description: 'Public allerac.ai website chatbot (widget).',
  domains: ['alleracweb'],
  nav: [{ key: 'alleracweb', name: 'Allerac Web', icon: '📣', path: '/alleracweb' }],
  tools: [],
  skills: ['alleracweb.md'],
  requiredEnv: [],
});
