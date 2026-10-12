import { defineModule } from '../types';

// Public-facing domain. Code still lives in src/app/openworld and skills/openworld.md.
export default defineModule({
  id: 'openworld',
  group: 'external',
  description: 'OpenWorld public foreign-trade assistant (website widget).',
  domains: ['openworld'],
  nav: [{ key: 'openworld', name: 'OpenWorld', icon: '🌐', path: '/openworld' }],
  tools: [],
  skills: ['openworld.md'],
  requiredEnv: [],
});
