'use server';

import fs from 'fs/promises';
import path from 'path';

const GITHUB_REPO = 'Allerac/allerac-one';
const GITHUB_API = 'https://api.github.com';

export interface BuildInfo {
  commit: string;
  date: string;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  date: string;
  author: string;
  url: string;
}

export interface UpdateStatus {
  currentCommit: string;
  currentDate: string;
  latestCommit: string | null;
  latestDate: string | null;
  updateAvailable: boolean;
  newCommits: CommitInfo[];
  error?: string;
}

/**
 * Read build info baked into the Docker image at build time
 */
async function getBuildInfo(): Promise<BuildInfo> {
  try {
    const buildInfoPath = path.join(process.cwd(), 'build-info.json');
    const data = JSON.parse(await fs.readFile(buildInfoPath, 'utf-8'));
    return {
      commit: data.commit || 'unknown',
      date: data.date || 'unknown',
    };
  } catch {
    return { commit: 'unknown', date: 'unknown' };
  }
}

/**
 * Fetch latest commits from GitHub main branch
 */
async function getLatestCommits(since?: string): Promise<CommitInfo[]> {
  try {
    let url = `${GITHUB_API}/repos/${GITHUB_REPO}/commits?sha=main&per_page=10`;
    if (since && since !== 'unknown') {
      url += `&since=${since}`;
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Allerac-One-Updater',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    return data.map((item: any) => ({
      sha: item.sha,
      shortSha: item.sha.substring(0, 7),
      message: item.commit.message.split('\n')[0],
      date: item.commit.author.date,
      author: item.commit.author.name,
      url: item.html_url,
    }));
  } catch (error: any) {
    console.error('Error fetching commits:', error);
    return [];
  }
}

/**
 * Check for updates by comparing local build commit with remote HEAD
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  try {
    const buildInfo = await getBuildInfo();
    const commits = await getLatestCommits();

    if (commits.length === 0) {
      return {
        currentCommit: buildInfo.commit,
        currentDate: buildInfo.date,
        latestCommit: null,
        latestDate: null,
        updateAvailable: false,
        newCommits: [],
      };
    }

    const latestCommit = commits[0];

    // If we don't know our commit, we can't compare
    if (buildInfo.commit === 'unknown') {
      return {
        currentCommit: buildInfo.commit,
        currentDate: buildInfo.date,
        latestCommit: latestCommit.shortSha,
        latestDate: latestCommit.date,
        updateAvailable: false,
        newCommits: [],
        error: 'Build info not available. Rebuild with latest install script to enable updates.',
      };
    }

    // Find new commits (those after our current commit)
    const currentIndex = commits.findIndex(c => c.sha.startsWith(buildInfo.commit) || c.shortSha === buildInfo.commit);
    const newCommits = currentIndex > 0 ? commits.slice(0, currentIndex) :
                       currentIndex === -1 ? commits : [];

    const updateAvailable = newCommits.length > 0;

    return {
      currentCommit: buildInfo.commit,
      currentDate: buildInfo.date,
      latestCommit: latestCommit.shortSha,
      latestDate: latestCommit.date,
      updateAvailable,
      newCommits,
    };
  } catch (error: any) {
    const buildInfo = await getBuildInfo();
    return {
      currentCommit: buildInfo.commit,
      currentDate: buildInfo.date,
      latestCommit: null,
      latestDate: null,
      updateAvailable: false,
      newCommits: [],
      error: error.message,
    };
  }
}

/**
 * Get current version from package.json (kept for backward compatibility)
 */
export async function getCurrentVersion(): Promise<string> {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    return packageJson.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}
