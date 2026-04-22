/**
 * Worker-side state I/O — atomic read/write of state.json with a
 * promise-chain serializer so concurrent updateState() calls observe
 * each other in order.
 *
 * Returned by createStateIO() as a closure-bound trio
 * (readState/writeState/updateState). The state file path and the
 * lock chain live inside that closure so each call to createStateIO()
 * gets an independent instance — what makes the helpers unit-testable
 * against a tmp directory.
 */

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";

import type { AiEditState } from "../shared/types";

export interface StateIOOptions {
  /** Absolute path to state.json. */
  stateFile: string;
}

export interface StateIO {
  readState(): Promise<AiEditState>;
  writeState(state: AiEditState): Promise<AiEditState>;
  updateState(
    mutator: (state: AiEditState) => AiEditState | Promise<AiEditState>
  ): Promise<AiEditState>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createStateIO({ stateFile }: StateIOOptions): StateIO {
  let stateLock = Promise.resolve();

  const withStateLock = async <T>(task: () => Promise<T>) => {
    const next = stateLock.then(task, task);
    stateLock = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  const readStateUnlocked = async () => {
    const raw = JSON.parse(await fs.readFile(stateFile, "utf8")) as AiEditState;
    if (!Array.isArray(raw.queue)) raw.queue = [];
    if (!Array.isArray(raw.messages)) raw.messages = [];
    if (!Array.isArray(raw.activityLog)) raw.activityLog = [];
    return raw;
  };

  const writeStateUnlocked = async (state: AiEditState) => {
    const next = { ...state, updatedAt: new Date().toISOString() };
    // Atomic write: per-process unique tmp + rename. v0.33.0 added
    // PID + random suffix so server and worker can't clobber each
    // other's in-flight tmp file (pre-fix both used the exact same
    // `${stateFile}.tmp`).
    const tmp = `${stateFile}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
    await fs.rename(tmp, stateFile);
    return next;
  };

  return {
    readState: () => withStateLock(readStateUnlocked),
    writeState: (state) => withStateLock(() => writeStateUnlocked(state)),
    updateState: (mutator) =>
      withStateLock(async () => {
        const current = await readStateUnlocked();
        const next = await mutator(clone(current));
        return writeStateUnlocked(next);
      })
  };
}
