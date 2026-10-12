import { defineModule } from '../types';

// Code still lives in src/app/{social,api/instagram,api/tiktok} and src/app/tools/instagram.tool.ts.
export default defineModule({
  id: 'social',
  group: 'personal',
  description: 'Social media manager (Instagram, TikTok).',
  domains: ['social'],
  nav: [{ key: 'social', name: 'Social', icon: '📸', path: '/social' }],
  tools: [
    'update_social_form',
    'instagram_publish_post',
    'instagram_get_profile',
    'instagram_get_recent_posts',
  ],
  skills: ['social.md'],
  requiredEnv: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', 'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
});
