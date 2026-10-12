import { defineModule } from '../types';

// Public-facing, text-only domain. Code still lives in src/app/sales and skills/sales.md.
export default defineModule({
  id: 'sales',
  group: 'external',
  description: 'Public sales assistant (website widget).',
  domains: ['sales'],
  nav: [{ key: 'sales', name: 'Sales', icon: '📣', path: '/sales' }],
  tools: [],
  skills: ['sales.md'],
  requiredEnv: [],
});
