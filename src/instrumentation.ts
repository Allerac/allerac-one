export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { syncSystemSkills } = await import('./app/services/skills/system-skills-loader');
    await syncSystemSkills();
  }
}
