import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface ActiveTarget {
  mode: 'local' | 'vps';
  instanceId?: string;
  host?: string;
  username?: string;
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
  setTarget: (mode: 'local' | 'vps', instanceId?: string, password?: string) => Promise<void>;
  refreshInstances: () => Promise<void>;
}

const defaultTarget: ActiveTarget = { mode: 'local' };

const ActiveTargetContext = createContext<ActiveTargetContextValue>({
  target: defaultTarget,
  instances: [],
  switching: false,
  setTarget: async () => {},
  refreshInstances: async () => {},
});

const STORAGE_KEY = 'clawsquire.active_target';

export function ActiveTargetProvider({ children }: { children: ReactNode }) {
  const [target, setTargetState] = useState<ActiveTarget>(defaultTarget);
  const [instances, setInstances] = useState<VpsInstance[]>([]);
  const [switching, setSwitching] = useState(false);

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

  const setTarget = useCallback(async (mode: 'local' | 'vps', instanceId?: string, password?: string) => {
    setSwitching(true);
    try {
      const result = await invoke<ActiveTarget>('set_active_target', {
        mode,
        instanceId: instanceId ?? null,
        password: password ?? null,
      });
      setTargetState(result);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, instanceId }));
      window.dispatchEvent(new CustomEvent('target-changed', { detail: result }));
    } finally {
      setSwitching(false);
    }
  }, []);

  return (
    <ActiveTargetContext.Provider value={{ target, instances, switching, setTarget, refreshInstances }}>
      {children}
    </ActiveTargetContext.Provider>
  );
}

export function useActiveTarget() {
  return useContext(ActiveTargetContext);
}
