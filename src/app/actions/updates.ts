'use server';

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

const GITHUB_REPO = 'Allerac/allerac-one';
const GITHUB_API = 'https://api.github.com';

export interface ReleaseInfo {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  latestRelease: ReleaseInfo | null;
  updateAvailable: boolean;
  error?: string;
}

export interface UpdateResult {
  success: boolean;
  message: string;
  newVersion?: string;
}

/**
 * Get current version from package.json
 */
export async function getCurrentVersion(): Promise<string> {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    return packageJson.version || '0.0.0';
  } catch (error) {
    console.error('Error reading package.json:', error);
    return '0.0.0';
  }
}

/**
 * Fetch latest release from GitHub
 */
export async function getLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const response = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Allerac-One-Updater',
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (response.status === 404) {
      // No releases yet
      return null;
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      tag_name: data.tag_name,
      name: data.name,
      body: data.body || '',
      published_at: data.published_at,
      html_url: data.html_url,
    };
  } catch (error: any) {
    console.error('Error fetching latest release:', error);
    return null;
  }
}

/**
 * Compare semantic versions
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  // Remove 'v' prefix if present
  const clean1 = v1.replace(/^v/, '');
  const clean2 = v2.replace(/^v/, '');

  const parts1 = clean1.split('.').map(Number);
  const parts2 = clean2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

/**
 * Check for updates
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  try {
    const [currentVersion, latestRelease] = await Promise.all([
      getCurrentVersion(),
      getLatestRelease(),
    ]);

    if (!latestRelease) {
      return {
        currentVersion,
        latestVersion: null,
        latestRelease: null,
        updateAvailable: false,
      };
    }

    const latestVersion = latestRelease.tag_name;
    const updateAvailable = compareVersions(currentVersion, latestVersion) < 0;

    return {
      currentVersion,
      latestVersion,
      latestRelease,
      updateAvailable,
    };
  } catch (error: any) {
    return {
      currentVersion: await getCurrentVersion(),
      latestVersion: null,
      latestRelease: null,
      updateAvailable: false,
      error: error.message,
    };
  }
}

/**
 * Apply update - this creates an update script that will be run
 * The actual update requires restarting the containers
 */
export async function applyUpdate(targetVersion: string): Promise<UpdateResult> {
  try {
    const installDir = process.cwd();

    // Fetch latest tags
    const { stderr: fetchErr } = await execAsync('git fetch --tags', { cwd: installDir });
    if (fetchErr && !fetchErr.includes('From')) {
      console.warn('Git fetch warning:', fetchErr);
    }

    // Check if tag exists
    const { stdout: tags } = await execAsync('git tag -l', { cwd: installDir });
    if (!tags.includes(targetVersion)) {
      return {
        success: false,
        message: `Version ${targetVersion} not found. Available tags: ${tags.trim() || 'none'}`,
      };
    }

    // Create update script
    const updateScript = `#!/bin/bash
# Allerac One Auto-Update Script
# Generated at: ${new Date().toISOString()}
# Target version: ${targetVersion}

set -e

cd "${installDir}"

echo "Stopping services..."
docker compose down

echo "Checking out version ${targetVersion}..."
git checkout ${targetVersion}

echo "Rebuilding..."
docker compose build

echo "Starting services..."
docker compose up -d

echo "Update complete! Now running version ${targetVersion}"
`;

    const scriptPath = path.join(installDir, 'update.sh');
    await fs.writeFile(scriptPath, updateScript, { mode: 0o755 });

    return {
      success: true,
      message: `Update script created at ${scriptPath}. Run it to apply the update.`,
      newVersion: targetVersion,
    };
  } catch (error: any) {
    console.error('Error preparing update:', error);
    return {
      success: false,
      message: error.message || 'Failed to prepare update',
    };
  }
}

/**
 * Get all available releases
 */
export async function getAllReleases(): Promise<ReleaseInfo[]> {
  try {
    const response = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/releases`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Allerac-One-Updater',
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.map((release: any) => ({
      tag_name: release.tag_name,
      name: release.name,
      body: release.body || '',
      published_at: release.published_at,
      html_url: release.html_url,
    }));
  } catch (error) {
    console.error('Error fetching releases:', error);
    return [];
  }
}
