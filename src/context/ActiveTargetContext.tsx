import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface ActiveTarget {
  mode: 'local' | 'protocol';
  instanceId?: string;
  host?: string;
  username?: string;
  /** Serve binary version reported after successful connection (e.g. "0.3.1"). */
  serveVersion?: string;
}

/** Must match PROTOCOL_VERSION in crates/clawsquire-core/src/protocol.rs */
export const DESKTOP_PROTOCOL_VERSION = '0.3.0';

/** True if the serve version's major matches ours (breaking changes only). */
export function isServeCompatible(serveVersion: string | undefined): boolean {
  if (!serveVersion) return true; // unknown → optimistic
  const majorOf = (v: string) => parseInt(v.split('.')[0] ?? '0', 10);
  return majorOf(DESKTOP_PROTOCOL_VERSION) === majorOf(serveVersion);
}

export interface VpsInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: 'password' | 'key';
  key_path?: string;
  openclaw_installed?: boolean;
  openclaw_version?: string;
  last_connected?: string;
  created_at: string;
}

interface ActiveTargetContextValue {
  target: ActiveTarget;
  instances: VpsInstance[];
  switching: boolean;
  error: string | null;
  setTarget: (mode: 'local' | 'protocol', opts?: ProtocolConnectOpts) => Promise<void>;
  refreshInstances: () => Promise<void>;
}

export interface ProtocolConnectOpts {
  url: string;
  token: string;
  instanceId?: string;
  host?: string;
}

const defaultTarget: ActiveTarget = { mode: 'local' };

const ActiveTargetContext = createContext<ActiveTargetContextValue>({
  target: defaultTarget,
  instances: [],
  switching: false,
  error: null,
  setTarget: async () => {},
  refreshInstances: async () => {},
});

const STORAGE_KEY = 'clawsquire.active_target';

export function ActiveTargetProvider({ children }: { children: ReactNode }) {
  const [target, setTargetState] = useState<ActiveTarget>(defaultTarget);
  const [instances, setInstances] = useState<VpsInstance[]>([]);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshInstances = useCallback(async () => {
    try {
      const list = await invoke<VpsInstance[]>('list_instances');
      setInstances(list);
    } catch {
      setInstances([]);
    }
  }, []);

  useEffect(() => {
    invoke<ActiveTarget>('get_active_target')
      .then(setTargetState)
      .catch(() => setTargetState(defaultTarget));
    refreshInstances();
  }, [refreshInstances]);

  const setTarget = useCallback(async (mode: 'local' | 'protocol', opts?: ProtocolConnectOpts) => {
    setSwitching(true);
    setError(null);
    try {
      const result = await invoke<ActiveTarget>('set_active_target', {
        mode,
        url: opts?.url ?? null,
        token: opts?.token ?? null,
        instanceId: opts?.instanceId ?? null,
        host: opts?.host ?? null,
      });
      setTargetState(result);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, url: opts?.url, host: opts?.host }));
      window.dispatchEvent(new CustomEvent('target-changed', { detail: result }));
    } catch (e) {
      setError(typeof e === 'string' ? e : String(e));
      throw e;
    } finally {
      setSwitching(false);
    }
  }, []);

  return (
    <ActiveTargetContext.Provider value={{ target, instances, switching, error, setTarget, refreshInstances }}>
      {children}
    </ActiveTargetContext.Provider>
  );
}

export function useActiveTarget() {
  return useContext(ActiveTargetContext);
}
