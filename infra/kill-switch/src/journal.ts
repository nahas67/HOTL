import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type ActionStatus = 'pending' | 'succeeded' | 'failed' | 'unconfigured';
export interface KillAction { name: string; status: ActionStatus; attempts: number; error?: string; completedAt?: string }
export interface KillState {
  engaged: boolean;
  engagedAt: string | null;
  engagedBy: string | null;
  reason: string | null;
  actions: KillAction[];
  revision: number;
}
type Event = { sequence: number; timestamp: string; type: 'engaged' | 'action'; payload: Record<string, unknown>; previousHash: string; hash: string };
const emptyState = (): KillState => ({ engaged: false, engagedAt: null, engagedBy: null, reason: null, actions: [], revision: 0 });
const digest = (data: Omit<Event, 'hash'>) => createHash('sha256').update(JSON.stringify(data)).digest('hex');

/** A single-writer, fsync-before-response journal. No transition can clear the latch. */
export class KillJournal {
  private state: KillState = emptyState();
  private previousHash = '';
  private lock: Awaited<ReturnType<typeof open>> | undefined;
  constructor(readonly path: string, private readonly allowInitialize: boolean) {}

  async initialize() {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    // Exclusive process ownership prevents split writers. A crash requires the runbook's stale-lock check.
    this.lock = await open(`${this.path}.lock`, 'wx', 0o600);
    await this.lock.writeFile(String(process.pid));
    try {
      let content: string;
      try { content = await readFile(this.path, 'utf8'); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !this.allowInitialize) throw error;
        const handle = await open(this.path, 'wx', 0o600);
        await handle.sync();
        await handle.close();
        content = '';
      }
      if (content && !content.endsWith('\n')) throw new Error('Incomplete kill journal: manual recovery required');
      for (const line of content.split('\n').filter(Boolean)) {
        const event = JSON.parse(line) as Event;
        const { hash, ...data } = event;
        if (data.sequence !== this.state.revision + 1 || data.previousHash !== this.previousHash || digest(data) !== hash) {
          throw new Error('Kill journal integrity check failed');
        }
        this.apply(event);
      }
    } catch (error) { await this.close(); throw error; }
  }

  snapshot(): KillState { return structuredClone(this.state); }

  private apply(event: Event) {
    if (event.type === 'engaged') {
      if (this.state.engaged) throw new Error('Duplicate latch event');
      this.state.engaged = true;
      this.state.engagedAt = event.timestamp;
      this.state.engagedBy = String(event.payload.actor);
      this.state.reason = String(event.payload.reason);
      this.state.actions = (event.payload.actions as string[]).map(name => ({ name, status: 'pending', attempts: 0 }));
    } else if (event.type === 'action' && this.state.engaged) {
      const action = event.payload as unknown as KillAction;
      const index = this.state.actions.findIndex(candidate => candidate.name === action.name);
      if (index < 0) throw new Error('Unknown action in kill journal');
      this.state.actions[index] = action;
    } else { throw new Error('Invalid kill journal transition'); }
    this.state.revision = event.sequence;
    this.previousHash = event.hash;
  }

  async append(type: Event['type'], payload: Record<string, unknown>) {
    const data = { sequence: this.state.revision + 1, timestamp: new Date().toISOString(), type, payload, previousHash: this.previousHash };
    const event: Event = { ...data, hash: digest(data) };
    const handle = await open(this.path, 'a', 0o600);
    try { await handle.writeFile(`${JSON.stringify(event)}\n`); await handle.sync(); }
    finally { await handle.close(); }
    this.apply(event);
  }

  async close() {
    if (this.lock) {
      const { unlink } = await import('node:fs/promises');
      await this.lock.close();
      this.lock = undefined;
      await unlink(`${this.path}.lock`);
    }
  }
}
