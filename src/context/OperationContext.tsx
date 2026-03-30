import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface OperationState {
  busy: boolean;
  label: string;
}

interface OperationContextValue {
  operation: OperationState;
  setBusy: (busy: boolean, label?: string) => void;
}

const OperationContext = createContext<OperationContextValue>({
  operation: { busy: false, label: '' },
  setBusy: () => {},
});

export function OperationProvider({ children }: { children: ReactNode }) {
  const [operation, setOperation] = useState<OperationState>({ busy: false, label: '' });

  const setBusy = useCallback((busy: boolean, label = '') => {
    setOperation({ busy, label });
  }, []);

  return (
    <OperationContext.Provider value={{ operation, setBusy }}>
      {children}
    </OperationContext.Provider>
  );
}

export function useOperation() {
  return useContext(OperationContext);
}
