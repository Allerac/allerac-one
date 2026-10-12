import { defineModule } from '../types';

// Code still lives in src/app/{music,api/spotify,services/spotify} and src/app/tools/music.tool.ts.
export default defineModule({
  id: 'music',
  group: 'personal',
  description: 'Spotify-based music recommendations and playlists.',
  domains: ['music'],
  nav: [{ key: 'music', name: 'Music', icon: '🎵', path: '/music' }],
  tools: [
    'get_music_recommendations',
    'get_top_tracks',
    'get_listening_stats',
    'get_spotify_status',
    'get_playlists',
    'get_playlist_tracks',
    'create_playlist',
    'add_tracks_to_playlist',
  ],
  skills: ['music.md'],
  requiredEnv: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_URI'],
});
