jest.mock('@/app/clients/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));
jest.mock('@/app/services/skills/skills.service', () => ({
  skillsService: {
    getActiveSkill: jest.fn(),
    getSkillForUser: jest.fn(),
    getSkillByName: jest.fn(),
    getDefaultDomainSkill: jest.fn(),
    getDefaultUserSkill: jest.fn(),
    getAvailableSkills: jest.fn(),
    detectIntent: jest.fn(),
    activateSkill: jest.fn(),
  },
}));

import pool from '@/app/clients/db';
import { resolveActiveChatSkill } from '@/app/services/chat/chat-skill-resolver';
import { skillsService } from '@/app/services/skills/skills.service';

describe('resolveActiveChatSkill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (skillsService.getActiveSkill as jest.Mock).mockResolvedValue(null);
    (skillsService.getDefaultDomainSkill as jest.Mock).mockResolvedValue(null);
    (skillsService.getDefaultUserSkill as jest.Mock).mockResolvedValue(null);
    (skillsService.getAvailableSkills as jest.Mock).mockResolvedValue([]);
    (skillsService.detectIntent as jest.Mock).mockResolvedValue(null);
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
  });

  test('activates a visible pre-selected skill for a new conversation', async () => {
    const selected = { id: 'skill-1', name: 'code', display_name: 'Code' };
    (skillsService.getSkillForUser as jest.Mock).mockResolvedValue(selected);

    await expect(resolveActiveChatSkill({
      conversationId: 'conv-1',
      userId: 'user-1',
      message: 'build this',
      isNewConversation: true,
      preSelectedSkillId: 'skill-1',
      emit: jest.fn(),
    })).resolves.toBe(selected);

    expect(skillsService.activateSkill).toHaveBeenCalledWith(
      'skill-1',
      'conv-1',
      'user-1',
      'manual',
      'Pre-selected by user',
    );
  });

  test('activates the domain default skill for a new conversation', async () => {
    const domainDefault = { id: 'skill-domain', name: 'robot-assistant', display_name: 'Robot Assistant' };
    (skillsService.getDefaultDomainSkill as jest.Mock).mockResolvedValue(domainDefault);

    await expect(resolveActiveChatSkill({
      conversationId: 'conv-1',
      userId: 'user-1',
      message: 'hey allerac',
      domain: 'robot-assistant',
      isNewConversation: true,
      emit: jest.fn(),
    })).resolves.toBe(domainDefault);

    expect(skillsService.activateSkill).toHaveBeenCalledWith(
      'skill-domain',
      'conv-1',
      'user-1',
      'manual',
      'Domain default skill',
    );
  });

  test('emits an event when intent detection switches skill', async () => {
    const detected = { id: 'skill-2', name: 'search', display_name: 'Search' };
    const emit = jest.fn();
    (skillsService.getAvailableSkills as jest.Mock).mockResolvedValue([detected]);
    (skillsService.detectIntent as jest.Mock).mockResolvedValue(detected);

    await resolveActiveChatSkill({
      conversationId: 'conv-1',
      userId: 'user-1',
      message: 'latest news',
      isNewConversation: false,
      emit,
    });

    expect(emit).toHaveBeenCalledWith({
      type: 'skill_activated',
      skill: { id: 'skill-2', name: 'search', display_name: 'Search' },
    });
  });
});
