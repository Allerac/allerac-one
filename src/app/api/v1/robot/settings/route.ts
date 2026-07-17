import { z } from 'zod';
import { requireApiDomainUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { skillsService } from '@/app/services/skills/skills.service';
import { TOOL_REGISTRY, TOOLS } from '@/app/tools/tools';

const systemSettingsService = new SystemSettingsService();

const VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'cedar',
  'coral',
  'echo',
  'fable',
  'marin',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
]);

const updateSchema = z.object({
  voice: z.string().trim().refine(value => VOICES.has(value), 'Unsupported voice'),
  speed: z.number().min(0.25).max(4),
  style: z.string().trim().min(1).max(1000),
});

export async function GET(request: Request): Promise<Response> {
  try {
    await requireApiDomainUser('chat:read', 'robot-assistant', request);
    const [settings, defaultSkill] = await Promise.all([
      systemSettingsService.loadAll(),
      skillsService.getDefaultDomainSkill('robot-assistant'),
    ]);
    const allowedToolNames = defaultSkill ? await skillsService.getSkillTools(defaultSkill.id) : [];
    const runtimeToolNames = new Set(TOOLS.map(tool => tool.function.name));
    const registryByName = new Map(TOOL_REGISTRY.map(tool => [tool.name, tool]));
    const tools = allowedToolNames.map(name => {
      const metadata = registryByName.get(name);
      return {
        name,
        label: metadata?.label || name,
        description: metadata?.description || 'Enabled for the robot assistant skill',
        group: metadata?.group || 'Other',
        runtimeAvailable: runtimeToolNames.has(name),
      };
    });

    return apiData({
      voice: settings.robot_speech_voice || 'onyx',
      speed: Number.parseFloat(settings.robot_speech_speed || '') || 1.15,
      style: settings.robot_speech_style || 'Speak naturally as a warm male robot assistant. Keep the delivery conversational, clear, and calm.',
      voices: Array.from(VOICES),
      defaultSkill: defaultSkill ? {
        id: defaultSkill.id,
        name: defaultSkill.name,
        displayName: defaultSkill.display_name,
      } : null,
      tools,
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/robot/settings failed', error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const user = await requireApiDomainUser('chat:write', 'robot-assistant', request);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid robot settings', 400, parsed.error.flatten());
    }

    await systemSettingsService.saveAll({
      robot_speech_voice: parsed.data.voice,
      robot_speech_speed: String(parsed.data.speed),
      robot_speech_style: parsed.data.style,
    }, user.id);

    return apiData({
      voice: parsed.data.voice,
      speed: parsed.data.speed,
      style: parsed.data.style,
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('PUT /api/v1/robot/settings failed', error);
  }
}
