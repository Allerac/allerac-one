import '../../../__tests__/__mocks__/db'; // Import mock first
import { SkillsService } from '@/app/services/skills/skills.service';
import pool from '@/app/clients/db';

const mockQuery = (pool as any).query;

describe('SkillsService', () => {
  let skillsService: SkillsService;

  beforeEach(() => {
    jest.clearAllMocks();
    skillsService = new SkillsService();
  });

  describe('getAvailableSkills()', () => {
    it('should return user own skills + public shared skills', async () => {
      const userId = 'user_123';
      const skills = [
        { id: 'skill_own', name: 'My Skill', shared: false, user_id: userId },
        { id: 'skill_shared', name: 'Public Skill', shared: true, user_id: 'user_456' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: skills });

      const result = await skillsService.getAvailableSkills(userId);

      expect(result).toEqual(skills);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 OR shared = true'),
        [userId]
      );
    });

    it('should return empty array when no skills', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await skillsService.getAvailableSkills('user_123');

      expect(result).toEqual([]);
    });

    it('should order by verified DESC, install_count DESC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await skillsService.getAvailableSkills('user_123');

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('ORDER BY verified DESC, install_count DESC');
    });
  });

  describe('getSkillById()', () => {
    it('should return skill by ID', async () => {
      const skill = { id: 'skill_123', name: 'Test Skill', description: 'A test' };

      mockQuery.mockResolvedValueOnce({ rows: [skill] });

      const result = await skillsService.getSkillById('skill_123');

      expect(result).toEqual(skill);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM skills WHERE id = $1',
        ['skill_123']
      );
    });

    it('should return null when skill not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await skillsService.getSkillById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getSkillByName()', () => {
    it('should find skill by name case-insensitive with userId', async () => {
      const skill = { id: 'skill_123', name: 'My Skill' };

      mockQuery.mockResolvedValueOnce({ rows: [skill] });

      const result = await skillsService.getSkillByName('MY SKILL', 'user_123');

      expect(result).toEqual(skill);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(name) = LOWER($1)'),
        ['MY SKILL', 'user_123']
      );
    });

    it('should find public skill without userId', async () => {
      const skill = { id: 'skill_public', name: 'Public Skill', shared: true };

      mockQuery.mockResolvedValueOnce({ rows: [skill] });

      const result = await skillsService.getSkillByName('Public Skill');

      expect(result).toEqual(skill);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('shared = true'),
        ['Public Skill']
      );
    });

    it('should return null when skill not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await skillsService.getSkillByName('NonExistent', 'user_123');

      expect(result).toBeNull();
    });
  });

  describe('getActiveSkill()', () => {
    it('should return active skill for conversation', async () => {
      const skill = { id: 'skill_active', name: 'Active Skill' };

      mockQuery.mockResolvedValueOnce({ rows: [skill] });

      const result = await skillsService.getActiveSkill('conv_123');

      expect(result).toEqual(skill);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('conversation_active_skills'),
        ['conv_123']
      );
    });

    it('should return null when no active skill', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await skillsService.getActiveSkill('conv_123');

      expect(result).toBeNull();
    });
  });

  describe('activateSkill()', () => {
    it('should log skill usage and update conversation active skill', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // getActiveSkill returns null
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT skill_usage
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPSERT conversation_active_skills

      await skillsService.activateSkill(
        'skill_123',
        'conv_456',
        'user_789',
        'manual',
        'User clicked button',
        'bot_id'
      );

      // Should make 3 queries
      expect(mockQuery).toHaveBeenCalledTimes(3);

      // Check INSERT skill_usage
      const usageCall = mockQuery.mock.calls[1];
      expect(usageCall[0]).toContain('INSERT INTO skill_usage');
      expect(usageCall[1]).toEqual(['skill_123', 'conv_456', 'user_789', 'bot_id', 'manual', 'User clicked button', null]);

      // Check UPSERT conversation_active_skills
      const activeCall = mockQuery.mock.calls[2];
      expect(activeCall[0]).toContain('ON CONFLICT (conversation_id)');
    });

    it('should handle null previous skill', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no previous skill
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPSERT

      await skillsService.activateSkill('skill_new', 'conv_456', 'user_789', 'auto');

      const usageCall = mockQuery.mock.calls[1];
      expect(usageCall[1][6]).toBeNull(); // previous_skill_id should be null
    });

    it('should handle previous skill ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'skill_old' }] }); // previous skill exists
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPSERT

      await skillsService.activateSkill('skill_new', 'conv_456', 'user_789', 'auto');

      const usageCall = mockQuery.mock.calls[1];
      expect(usageCall[1][6]).toBe('skill_old'); // previous_skill_id
    });
  });

  describe('deactivateSkill()', () => {
    it('should delete active skill for conversation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await skillsService.deactivateSkill('conv_123');

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM conversation_active_skills WHERE conversation_id = $1',
        ['conv_123']
      );
    });
  });

  describe('createSkill()', () => {
    it('should create skill with provided data', async () => {
      const skillData = {
        user_id: 'user_123',
        name: 'New Skill',
        display_name: 'New Skill',
        description: 'A new skill',
        content: '## Skill Content',
        category: 'workflow',
      };

      const createdSkill = { id: 'skill_new', ...skillData };

      mockQuery.mockResolvedValueOnce({ rows: [createdSkill] });

      const result = await skillsService.createSkill(skillData);

      expect(result).toEqual(createdSkill);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO skills'),
        expect.arrayContaining(['user_123', 'New Skill'])
      );
    });

    it('should use defaults for optional fields', async () => {
      const skillData = {
        name: 'Basic Skill',
        display_name: 'Basic Skill',
        description: 'Test',
        content: 'Content',
      };

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'skill_1', ...skillData }] });

      await skillsService.createSkill(skillData);

      const call = mockQuery.mock.calls[0];
      const params = call[1];

      // Check defaults: learning_enabled=false, category='workflow', etc
      expect(params[5]).toBe('workflow'); // category default
      expect(params[6]).toBe(false); // learning_enabled default
    });
  });

  describe('updateSkill()', () => {
    it('should update skill with provided data', async () => {
      const updates = {
        display_name: 'Updated Name',
        description: 'Updated description',
      };

      const updatedSkill = { id: 'skill_123', ...updates };

      mockQuery.mockResolvedValueOnce({ rows: [updatedSkill] });

      const result = await skillsService.updateSkill('skill_123', updates);

      expect(result).toEqual(updatedSkill);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE skills SET'),
        expect.arrayContaining(['skill_123', 'Updated Name', 'Updated description'])
      );
    });

    it('should return updated skill with all fields', async () => {
      const skillData = {
        display_name: 'New Name',
        content: 'New content',
      };

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'skill_456', name: 'Original', ...skillData }] });

      const result = await skillsService.updateSkill('skill_456', skillData);

      expect(result.id).toBe('skill_456');
      expect(result.display_name).toBe('New Name');
    });
  });

  describe('completeSkillUsage()', () => {
    it('should mark skill usage as complete', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await skillsService.completeSkillUsage('conv_123', true, 150, 2, null);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE skill_usage'),
        expect.arrayContaining(['conv_123', true, 150, 2, null])
      );
    });

    it('should handle error message', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await skillsService.completeSkillUsage('conv_123', false, null, 0, 'Timeout error');

      const call = mockQuery.mock.calls[0];
      expect(call[1][4]).toBe('Timeout error');
    });
  });

  describe('rateSkill()', () => {
    it('should rate skill and update usage record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE skill_usage
      mockQuery.mockResolvedValueOnce({ rows: [] }); // updateSkillRating query

      await skillsService.rateSkill('skill_123', 'conv_456', 5, 'Very useful');

      expect(mockQuery).toHaveBeenCalledTimes(2);

      const ratingCall = mockQuery.mock.calls[0];
      expect(ratingCall[0]).toContain('UPDATE skill_usage');
      expect(ratingCall[1]).toContain(5); // rating
      expect(ratingCall[1]).toContain('Very useful'); // feedback
    });

    it('should throw error for invalid rating', async () => {
      await expect(
        skillsService.rateSkill('skill_123', 'conv_456', 6, 'feedback')
      ).rejects.toThrow('Rating must be between 1 and 5');

      await expect(
        skillsService.rateSkill('skill_123', 'conv_456', 0, 'feedback')
      ).rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should accept null feedback', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await skillsService.rateSkill('skill_123', 'conv_456', 4);

      const call = mockQuery.mock.calls[0];
      expect(call[1]).toContain(null); // feedback is null
    });
  });

  describe('getSkillStats()', () => {
    it('should calculate skill usage statistics', async () => {
      const usages = [
        { success: true, tokens_used: 100, user_rating: 5 },
        { success: true, tokens_used: 150, user_rating: 4 },
        { success: false, tokens_used: 80, user_rating: null },
      ];

      mockQuery.mockResolvedValueOnce({ rows: usages });

      const result = await skillsService.getSkillStats('skill_123');

      expect(result.count).toBe(3);
      expect(result.successRate).toBe(67); // 2/3 successful = 0.666... ≈ 67%
      expect(result.avgRating).toBe(3); // (5+4)/3 = 3 (divided by total count, not rated count)
      expect(result.avgTokens).toBe(110); // (100+150+80)/3 ≈ 110
    });

    it('should filter by userId when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await skillsService.getSkillStats('skill_123', 'user_456');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE skill_id = $1 AND user_id = $2'),
        ['skill_123', 'user_456']
      );
    });

    it('should handle empty usage array', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await skillsService.getSkillStats('skill_empty');

      expect(result.count).toBe(0);
      expect(result.successRate).toBe(0);
      expect(result.avgRating).toBe(0);
    });
  });

  describe('assignSkillToUser()', () => {
    it('should assign skill to user and increment install count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT user_skills
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE skills.install_count

      await skillsService.assignSkillToUser('skill_123', 'user_456', false);

      expect(mockQuery).toHaveBeenCalledTimes(2);

      const assignCall = mockQuery.mock.calls[0];
      expect(assignCall[0]).toContain('INSERT INTO user_skills');
      expect(assignCall[1]).toEqual(['skill_123', 'user_456', false]);

      const countCall = mockQuery.mock.calls[1];
      expect(countCall[0]).toContain('UPDATE skills SET install_count');
    });

    it('should clear other defaults when setting as default', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE defaults
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT user_skills
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE install_count

      await skillsService.assignSkillToUser('skill_123', 'user_456', true);

      const defaultsClear = mockQuery.mock.calls[0];
      expect(defaultsClear[0]).toContain('UPDATE user_skills SET is_default = false');
      expect(defaultsClear[1]).toEqual(['user_456']);
    });
  });

  describe('unassignSkillFromUser()', () => {
    it('should delete skill assignment from user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await skillsService.unassignSkillFromUser('skill_123', 'user_456');

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM user_skills WHERE skill_id = $1 AND user_id = $2',
        ['skill_123', 'user_456']
      );
    });
  });

  describe('shouldAutoActivate()', () => {
    it('should return false for skill without rules', async () => {
      const skill = { auto_switch_rules: null };

      const result = await skillsService.shouldAutoActivate(skill as any, { message: 'test' });

      expect(result).toBe(false);
    });

    it('should match keyword in message', async () => {
      const skill = {
        auto_switch_rules: { keywords: ['python', 'code'] },
      };

      const result = await skillsService.shouldAutoActivate(skill as any, {
        message: 'write some Python code',
      });

      expect(result).toBe(true);
    });

    it('should not match if keyword not present', async () => {
      const skill = {
        auto_switch_rules: { keywords: ['python'] },
      };

      const result = await skillsService.shouldAutoActivate(skill as any, {
        message: 'write some JavaScript',
      });

      expect(result).toBe(false);
    });

    it('should match file type in message', async () => {
      const skill = {
        auto_switch_rules: { file_types: ['.pdf', '.docx'] },
      };

      const result = await skillsService.shouldAutoActivate(skill as any, {
        message: 'analyze this .pdf file',
      });

      expect(result).toBe(true);
    });

    it('should be case-insensitive for keywords', async () => {
      const skill = {
        auto_switch_rules: { keywords: ['PYTHON'] },
      };

      const result = await skillsService.shouldAutoActivate(skill as any, {
        message: 'write python code',
      });

      expect(result).toBe(true);
    });
  });

  describe('deleteSkill()', () => {
    it('should delete skill and handle cascading references', async () => {
      // Mock the transaction flow
      mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE previous_skill_id
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE previous_skill_id in skill_usage
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE conversation_active_skills
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE telegram_bot_skills
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE user_skills
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE skill_usage
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE skills
      mockQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Mock client
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // UPDATE previous_skill_id 1
          .mockResolvedValueOnce({ rows: [] }) // UPDATE previous_skill_id 2
          .mockResolvedValueOnce({ rows: [] }) // DELETE active
          .mockResolvedValueOnce({ rows: [] }) // DELETE bot
          .mockResolvedValueOnce({ rows: [] }) // DELETE user
          .mockResolvedValueOnce({ rows: [] }) // DELETE usage
          .mockResolvedValueOnce({ rows: [] }) // DELETE skill
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };

      (pool as any).connect = jest.fn().mockResolvedValueOnce(mockClient);

      await skillsService.deleteSkill('skill_123', 'user_456');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      // Verify user check in DELETE
      const deleteCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('DELETE FROM skills WHERE id = $1 AND user_id = $2')
      );
      expect(deleteCall).toBeDefined();
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
