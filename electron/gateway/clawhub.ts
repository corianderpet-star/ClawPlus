/**
 * ClawHub Service
 * Manages interactions with the ClawHub CLI for skills management
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app, shell } from 'electron';
import { getOpenClawConfigDir, ensureDir, getClawHubCliBinPath, getClawHubCliEntryPath, quoteForCmd } from '../utils/paths';

export interface ClawHubSearchParams {
    query: string;
    limit?: number;
}

export interface ClawHubInstallParams {
    slug: string;
    version?: string;
    force?: boolean;
}

export interface ClawHubUninstallParams {
    slug: string;
}

export interface ClawHubSkillResult {
    slug: string;
    name: string;
    description: string;
    version: string;
    author?: string;
    downloads?: number;
    stars?: number;
}

export class ClawHubService {
    private workDir: string;
    private cliPath: string;
    private cliEntryPath: string;
    private useNodeRunner: boolean;
    private ansiRegex: RegExp;
    private region: 'global' | 'china' = 'global';

    /* ── Rate-limit / throttle infrastructure ── */

    /** Minimum interval (ms) between consecutive ClawHub CLI invocations. */
    private static readonly MIN_CMD_INTERVAL_MS = 3_000;

    /** Serialisation queue – ensures only one CLI process at a time. */
    private cmdQueue: Promise<string> = Promise.resolve('');
    /** Timestamp of the last CLI invocation start. */
    private lastCmdStartedAt = 0;

    /* ── Result caches ── */
    private listCache: { ts: number; data: Array<{ slug: string; version: string }> } | null = null;
    private exploreCache: { ts: number; data: ClawHubSkillResult[] } | null = null;
    private searchCache = new Map<string, { ts: number; data: ClawHubSkillResult[] }>();

    private static readonly LIST_CACHE_TTL_MS = 30_000;       // 30 s
    private static readonly EXPLORE_CACHE_TTL_MS = 120_000;   // 2 min
    private static readonly SEARCH_CACHE_TTL_MS = 60_000;     // 1 min

    constructor() {
        // Use the user's OpenClaw config directory (~/.openclaw) for skill management
        // This avoids installing skills into the project's openclaw submodule
        this.workDir = getOpenClawConfigDir();
        ensureDir(this.workDir);

        const binPath = getClawHubCliBinPath();
        const entryPath = getClawHubCliEntryPath();

        this.cliEntryPath = entryPath;
        if (!app.isPackaged && fs.existsSync(binPath)) {
            this.cliPath = binPath;
            this.useNodeRunner = false;
        } else {
            this.cliPath = process.execPath;
            this.useNodeRunner = true;
        }
        const esc = String.fromCharCode(27);
        const csi = String.fromCharCode(155);
        const pattern = `(?:${esc}|${csi})[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]`;
        this.ansiRegex = new RegExp(pattern, 'g');
    }

    /** Switch skill store region (global vs china). Clears all caches. */
    setRegion(region: 'global' | 'china'): void {
        if (this.region === region) return;
        this.region = region;
        this.listCache = null;
        this.exploreCache = null;
        this.searchCache.clear();
        console.log(`[ClawHub] Region set to: ${region}`);
    }

    getRegion(): 'global' | 'china' {
        return this.region;
    }

    private stripAnsi(line: string): string {
        return line.replace(this.ansiRegex, '').trim();
    }

    /**
     * Run a ClawHub CLI command (serialised & throttled).
     *
     * Commands are queued so only one runs at a time, and there is a guaranteed
     * minimum gap (`MIN_CMD_INTERVAL_MS`) between consecutive invocations to
     * avoid triggering ClawHub's server-side rate limiter.
     */
    private runCommand(args: string[]): Promise<string> {
        const next = this.cmdQueue.catch(() => {/* swallow predecessor errors */ }).then(async () => {
            // Enforce minimum interval
            const elapsed = Date.now() - this.lastCmdStartedAt;
            const wait = ClawHubService.MIN_CMD_INTERVAL_MS - elapsed;
            if (wait > 0) {
                console.log(`ClawHub throttle: waiting ${wait}ms before next command`);
                await new Promise<void>((r) => setTimeout(r, wait));
            }
            this.lastCmdStartedAt = Date.now();
            return this.runCommandRaw(args);
        });
        this.cmdQueue = next.catch(() => '');   // keep queue alive on error
        return next;
    }

    /**
     * Raw CLI execution (no throttling / queuing).
     */
    private runCommandRaw(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            if (this.useNodeRunner && !fs.existsSync(this.cliEntryPath)) {
                reject(new Error(`ClawHub CLI entry not found at: ${this.cliEntryPath}`));
                return;
            }

            if (!this.useNodeRunner && !fs.existsSync(this.cliPath)) {
                reject(new Error(`ClawHub CLI not found at: ${this.cliPath}`));
                return;
            }

            const commandArgs = this.useNodeRunner ? [this.cliEntryPath, ...args] : args;
            const displayCommand = [this.cliPath, ...commandArgs].join(' ');
            console.log(`Running ClawHub command: ${displayCommand}`);

            const isWin = process.platform === 'win32';
            const useShell = isWin && !this.useNodeRunner;
            const { NODE_OPTIONS: _nodeOptions, ...baseEnv } = process.env;
            const env: Record<string, string | undefined> = {
                ...baseEnv,
                CI: 'true',
                FORCE_COLOR: '0',
            };
            if (this.useNodeRunner) {
                env.ELECTRON_RUN_AS_NODE = '1';
            }
            const spawnCmd = useShell ? quoteForCmd(this.cliPath) : this.cliPath;
            const spawnArgs = useShell ? commandArgs.map(a => quoteForCmd(a)) : commandArgs;
            const child = spawn(spawnCmd, spawnArgs, {
                cwd: this.workDir,
                shell: useShell,
                env: {
                    ...env,
                    CLAWHUB_WORKDIR: this.workDir,
                    // When region is china, set mirror env vars that the CLI may honour
                    ...(this.region === 'china' ? {
                        CLAWHUB_MIRROR: 'https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com',
                        CLAWHUB_REGISTRY: 'https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com',
                        SKILLHUB_ACCELERATE: '1',
                    } : {}),
                },
                windowsHide: true,
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('error', (error) => {
                console.error('ClawHub process error:', error);
                reject(error);
            });

            child.on('close', (code) => {
                if (code !== 0 && code !== null) {
                    console.error(`ClawHub command failed with code ${code}`);
                    console.error('Stderr:', stderr);
                    reject(new Error(`Command failed: ${stderr || stdout}`));
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }

    /**
     * Search for skills
     */
    async search(params: ClawHubSearchParams): Promise<ClawHubSkillResult[]> {
        try {
            // If query is empty, use 'explore' to show trending skills
            if (!params.query || params.query.trim() === '') {
                return this.explore({ limit: params.limit });
            }

            // Check search cache
            const cacheKey = `${params.query}|${params.limit ?? ''}`;
            const cached = this.searchCache.get(cacheKey);
            if (cached && Date.now() - cached.ts < ClawHubService.SEARCH_CACHE_TTL_MS) {
                console.log(`ClawHub search cache hit for "${params.query}"`);
                return cached.data;
            }

            const args = ['search', params.query];
            if (params.limit) {
                args.push('--limit', String(params.limit));
            }

            const output = await this.runCommand(args);
            if (!output || output.includes('No skills found')) {
                return [];
            }

            const lines = output.split('\n').filter(l => l.trim());
            const results = lines.map(line => {
                const cleanLine = this.stripAnsi(line);

                // Format could be: slug vversion description (score)
                // Or sometimes: slug  vversion  description
                let match = cleanLine.match(/^(\S+)\s+v?(\d+\.\S+)\s+(.+)$/);
                if (match) {
                    const slug = match[1];
                    const version = match[2];
                    let description = match[3];

                    // Clean up score if present at the end
                    description = description.replace(/\(\d+\.\d+\)$/, '').trim();

                    return {
                        slug,
                        name: slug,
                        version,
                        description,
                    };
                }

                // Fallback for new clawhub search format without version:
                // slug  name/description  (score)
                match = cleanLine.match(/^(\S+)\s+(.+)$/);
                if (match) {
                    const slug = match[1];
                    let description = match[2];

                    // Clean up score if present at the end
                    description = description.replace(/\(\d+\.\d+\)$/, '').trim();

                    return {
                        slug,
                        name: slug,
                        version: 'latest', // Fallback version since it's not provided
                        description,
                    };
                }
                return null;
            }).filter((s): s is ClawHubSkillResult => s !== null);

            // Store in cache
            this.searchCache.set(cacheKey, { ts: Date.now(), data: results });
            return results;
        } catch (error) {
            console.error('ClawHub search error:', error);
            throw error;
        }
    }

    /**
     * Explore trending skills
     */
    async explore(params: { limit?: number } = {}): Promise<ClawHubSkillResult[]> {
        try {
            // Check explore cache
            if (this.exploreCache && Date.now() - this.exploreCache.ts < ClawHubService.EXPLORE_CACHE_TTL_MS) {
                console.log('ClawHub explore cache hit');
                return this.exploreCache.data;
            }

            const args = ['explore'];
            if (params.limit) {
                args.push('--limit', String(params.limit));
            }

            const output = await this.runCommand(args);
            if (!output) return [];

            const lines = output.split('\n').filter(l => l.trim());
            const results = lines.map(line => {
                const cleanLine = this.stripAnsi(line);

                // Format: slug vversion time description
                // Example: my-skill v1.0.0 2 hours ago A great skill
                const match = cleanLine.match(/^(\S+)\s+v?(\d+\.\S+)\s+(.+? ago|just now|yesterday)\s+(.+)$/i);
                if (match) {
                    return {
                        slug: match[1],
                        name: match[1],
                        version: match[2],
                        description: match[4],
                    };
                }
                return null;
            }).filter((s): s is ClawHubSkillResult => s !== null);

            this.exploreCache = { ts: Date.now(), data: results };
            return results;
        } catch (error) {
            console.error('ClawHub explore error:', error);
            throw error;
        }
    }

    /**
     * Install a skill
     */
    async install(params: ClawHubInstallParams): Promise<void> {
        const args = ['install', params.slug];

        if (params.version) {
            args.push('--version', params.version);
        }

        if (params.force) {
            args.push('--force');
        }

        await this.runCommand(args);

        // Invalidate caches so the next list/explore picks up the change
        this.listCache = null;
    }

    /**
     * Uninstall a skill
     */
    async uninstall(params: ClawHubUninstallParams): Promise<void> {
        const fsPromises = fs.promises;

        // Invalidate list cache
        this.listCache = null;

        // 1. Delete the skill directory
        const skillDir = path.join(this.workDir, 'skills', params.slug);
        if (fs.existsSync(skillDir)) {
            console.log(`Deleting skill directory: ${skillDir}`);
            await fsPromises.rm(skillDir, { recursive: true, force: true });
        }

        // 2. Remove from lock.json
        const lockFile = path.join(this.workDir, '.clawhub', 'lock.json');
        if (fs.existsSync(lockFile)) {
            try {
                const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
                if (lockData.skills && lockData.skills[params.slug]) {
                    console.log(`Removing ${params.slug} from lock.json`);
                    delete lockData.skills[params.slug];
                    await fsPromises.writeFile(lockFile, JSON.stringify(lockData, null, 2));
                }
            } catch (err) {
                console.error('Failed to update ClawHub lock file:', err);
            }
        }
    }

    /**
     * List installed skills
     */
    async listInstalled(): Promise<Array<{ slug: string; version: string }>> {
        try {
            // Check list cache
            if (this.listCache && Date.now() - this.listCache.ts < ClawHubService.LIST_CACHE_TTL_MS) {
                console.log('ClawHub list cache hit');
                return this.listCache.data;
            }

            const output = await this.runCommand(['list']);
            if (!output || output.includes('No installed skills')) {
                const empty: Array<{ slug: string; version: string }> = [];
                this.listCache = { ts: Date.now(), data: empty };
                return empty;
            }

            const lines = output.split('\n').filter(l => l.trim());
            const results = lines.map(line => {
                const cleanLine = this.stripAnsi(line);
                const match = cleanLine.match(/^(\S+)\s+v?(\d+\.\S+)/);
                if (match) {
                    return {
                        slug: match[1],
                        version: match[2],
                    };
                }
                return null;
            }).filter((s): s is { slug: string; version: string } => s !== null);

            this.listCache = { ts: Date.now(), data: results };
            return results;
        } catch (error) {
            console.error('ClawHub list error:', error);
            return [];
        }
    }

    /**
     * Open skill README/manual in default editor
     */
    async openSkillReadme(slug: string): Promise<boolean> {
        const skillDir = path.join(this.workDir, 'skills', slug);

        // Try to find documentation file
        const possibleFiles = ['SKILL.md', 'README.md', 'skill.md', 'readme.md'];
        let targetFile = '';

        for (const file of possibleFiles) {
            const filePath = path.join(skillDir, file);
            if (fs.existsSync(filePath)) {
                targetFile = filePath;
                break;
            }
        }

        if (!targetFile) {
            // If no md file, just open the directory
            if (fs.existsSync(skillDir)) {
                targetFile = skillDir;
            } else {
                throw new Error('Skill directory not found');
            }
        }

        try {
            // Open file with default application
            await shell.openPath(targetFile);
            return true;
        } catch (error) {
            console.error('Failed to open skill readme:', error);
            throw error;
        }
    }
}
