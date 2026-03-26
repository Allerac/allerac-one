export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Install console interceptor first so skill sync logs are captured
    const { installConsoleInterceptor } = await import('./lib/logger');
    installConsoleInterceptor();

    const { syncSystemSkills } = await import('./app/services/skills/system-skills-loader');
    await syncSystemSkills();
  }
}
