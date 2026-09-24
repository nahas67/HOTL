import type { EngineState } from "../types.js";

export interface RuntimeStateStore {
  read(): Promise<EngineState | null>;
  transaction<T>(
    callback: (
      current: EngineState | null,
    ) => Promise<{ state: EngineState; result: T }>,
  ): Promise<{ state: EngineState; result: T }>;
  close(): Promise<void>;
}
