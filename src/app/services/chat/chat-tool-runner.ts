import path from 'path';
import * as instagramActions from '@/app/actions/instagram';
import type { User } from '@/app/services/auth/auth.service';
import { HealthTool } from '@/app/tools/health.tool';
import { InstagramTool } from '@/app/tools/instagram.tool';
import { buildEmailTools } from '@/app/tools/email.tool';
import { buildGithubTools } from '@/app/tools/github.tool';
import { buildLogsTool } from '@/app/tools/logs.tool';
import { buildJobsTools } from '@/app/tools/jobs.tool';
import { buildNotesTools } from '@/app/tools/notes.tool';
import { ReadUrlTool } from '@/app/tools/read-url.tool';
import { SearchWebTool } from '@/app/tools/search-web.tool';
import { ShellTool } from '@/app/tools/shell.tool';
import { buildTicketsTools } from '@/app/tools/tickets.tool';
import {
  normalizeWorkspaceReferences,
  quoteShellArg,
  resolveShellCwd,
  resolveUserWorkspaceFilePath,
} from '@/app/lib/workspace-paths';
import {
  EMAIL_TOOL_NAMES,
  GITHUB_TOOL_NAMES,
  JOB_TOOL_NAMES,
  LOGS_TOOL_NAMES,
  NOTE_TOOL_NAMES,
  TICKET_TOOL_NAMES,
} from './chat-tool-registry';

export interface ChatToolRunnerContext {
  user: User;
  githubToken: string;
  tavilyApiKey?: string;
  message: string;
  locale: string;
  emit: (event: object) => void;
}

export async function executeChatTool(
  toolName: string,
  toolArgs: Record<string, any>,
  context: ChatToolRunnerContext,
): Promise<any> {
  const { user, githubToken, tavilyApiKey, message, locale, emit } = context;
  const userId = user.id;

  if (toolName === 'update_social_form' || toolName === 'update_instagram_form') {
    const { platform, caption, tags, price, is_product, image_url, tiktok_title } = toolArgs;
    const update: Record<string, any> = { type: 'studio_update' };
    if (platform === 'instagram' || platform === 'tiktok') update.platform = platform;
    if (caption !== undefined) update.caption = caption;
    if (tags !== undefined) update.tags = tags;
    if (price !== undefined) update.price = price;
    if (is_product !== undefined) update.isProduct = is_product;
    if (image_url !== undefined) update.imageUrl = image_url;
    if (tiktok_title !== undefined) update.tiktokTitle = tiktok_title;
    emit(update);
    return { success: true, message: 'Form updated.' };
  }

  if (toolName === 'get_today_info') {
    const { TodayTool } = await import('@/app/tools/today.tool');
    return new TodayTool().execute();
  }

  if (toolName === 'search_web' && tavilyApiKey) {
    return new SearchWebTool(tavilyApiKey, githubToken).execute(toolArgs.query);
  }

  if (toolName === 'read_url' && tavilyApiKey) {
    return new ReadUrlTool(tavilyApiKey).execute(toolArgs.url);
  }

  if (toolName === 'execute_shell') {
    const safeCwd = resolveShellCwd(userId, toolArgs.cwd);
    if (!safeCwd) {
      return { error: 'Invalid cwd. Shell commands must run inside your workspace.' };
    }
    const command = normalizeWorkspaceReferences(userId, String(toolArgs.command || ''));
    return new ShellTool().execute(command, safeCwd, toolArgs.timeout);
  }

  if (['instagram_publish_post', 'instagram_get_profile', 'instagram_get_recent_posts', 'instagram_create_post_draft'].includes(toolName)) {
    const instagramTool = new InstagramTool();
    if (toolName === 'instagram_create_post_draft') {
      let { caption, tags, image_url } = toolArgs;
      const isPublicUrl = image_url && (image_url.startsWith('http://') || image_url.startsWith('https://'));

      if (isPublicUrl && !caption) {
        try {
          const result = await instagramActions.generateCaption(image_url, userId, message, locale);
          if (result.success) caption = result.caption;
        } catch (error: any) {
          console.error('[Instagram] Caption generation error:', error.message);
        }
      }

      if (caption && !tags) {
        try {
          const result = await instagramActions.generateTags(userId, caption, locale);
          if (result.success) tags = result.tags;
        } catch (error: any) {
          console.error('[Instagram] Tags generation error:', error.message);
        }
      }

      emit({
        type: 'instagram_draft',
        caption: caption || '',
        tags: tags || '',
        image_url: image_url || '',
      });
      return {
        success: true,
        message: 'Post draft prepared. A preview button has been shown to the user.',
      };
    }
    if (toolName === 'instagram_publish_post') {
      return instagramTool.publishPost(userId, toolArgs.caption, toolArgs.image_url);
    }
    if (toolName === 'instagram_get_profile') {
      return instagramTool.getProfile(userId);
    }
    return instagramTool.getRecentMedia(userId, toolArgs.limit ?? 6);
  }

  if (['get_health_summary', 'get_health_metrics', 'get_daily_snapshot', 'get_garmin_status', 'get_recent_activities'].includes(toolName)) {
    const healthTool = new HealthTool();
    const healthUser = { id: userId, email: user.email, name: user.name || user.email };
    if (toolName === 'get_health_summary') {
      return healthTool.getSummary(healthUser, toolArgs.period || 'week');
    }
    if (toolName === 'get_health_metrics') {
      return healthTool.getMetrics(healthUser, toolArgs.start_date, toolArgs.end_date);
    }
    if (toolName === 'get_daily_snapshot') {
      return healthTool.getDailySnapshot(healthUser, toolArgs.date);
    }
    if (toolName === 'get_recent_activities') {
      return healthTool.getRecentActivities(
        healthUser,
        toolArgs.limit || 10,
        toolArgs.start_date,
        toolArgs.end_date,
      );
    }
    return healthTool.getGarminStatus(healthUser);
  }

  if (toolName === 'draw_canvas') {
    return { success: true, rendered: (toolArgs.elements || []).length };
  }

  if (toolName === 'edit_file') {
    const { path: rawPath, new_content: newContent, explanation } = toolArgs;
    const resolved = resolveUserWorkspaceFilePath(
      userId,
      normalizeWorkspaceReferences(userId, String(rawPath || '')),
    );
    if (!resolved) {
      return { error: 'Path is outside the user workspace. Only files in /workspace/projects/ can be edited.' };
    }

    const safeCwd = resolveShellCwd(userId, path.dirname(resolved));
    if (!safeCwd) return { error: 'Invalid workspace path.' };

    const readResult = await new ShellTool().execute(
      `cat ${quoteShellArg(resolved)} 2>/dev/null || echo ""`,
      safeCwd,
    );
    const oldContent = readResult.stdout.endsWith('\n')
      ? readResult.stdout.slice(0, -1)
      : readResult.stdout;
    emit({
      type: 'file_edit_proposal',
      path: resolved,
      oldContent,
      newContent,
      explanation,
    });
    return {
      success: true,
      message: 'Edit proposal shown to the user for review. Do not write the file yourself — wait for the user to accept or reject before continuing.',
    };
  }

  if (NOTE_TOOL_NAMES.includes(toolName)) {
    const handlers = buildNotesTools({ id: userId, githubToken: githubToken || null });
    const handler = handlers[toolName as keyof typeof handlers] as (args: any) => Promise<any>;
    return handler(toolArgs);
  }
  if (EMAIL_TOOL_NAMES.includes(toolName)) {
    const handlers = buildEmailTools(userId);
    const handler = handlers[toolName as keyof typeof handlers] as (args: any) => Promise<any>;
    return handler(toolArgs);
  }
  if (JOB_TOOL_NAMES.includes(toolName)) {
    const handlers = buildJobsTools(userId);
    const handler = handlers[toolName as keyof typeof handlers] as (args: any) => Promise<any>;
    return handler(toolArgs);
  }
  if (TICKET_TOOL_NAMES.includes(toolName)) {
    const handlers = buildTicketsTools(userId);
    const handler = handlers[toolName as keyof typeof handlers] as (args: any) => Promise<any>;
    const result = await handler(toolArgs);
    if (toolName === 'create_ticket' && result?.success) {
      emit({ type: 'ticket_created', ticket_id: result.ticket_id, title: result.title, type: result.type });
    }
    return result;
  }

  if (GITHUB_TOOL_NAMES.includes(toolName)) {
    if (!githubToken) return { error: 'GitHub token not configured.' };
    const handlers = buildGithubTools(githubToken);
    const handler = handlers[toolName as keyof typeof handlers] as (args: any) => Promise<any>;
    return handler(toolArgs);
  }

  if (LOGS_TOOL_NAMES.includes(toolName)) {
    const handlers = buildLogsTool();
    const handler = handlers[toolName as keyof typeof handlers] as (args: any) => Promise<any>;
    return handler(toolArgs);
  }

  return { error: `Tool ${toolName} not available` };
}
