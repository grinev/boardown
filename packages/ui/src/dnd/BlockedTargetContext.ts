import { createContext, useContext } from 'react';

// While a drag is running, the one target the board would refuse. Drag state is
// view state, so it travels down through context rather than through the store.
const BlockedTargetContext = createContext<string | null>(null);

export const BlockedTargetProvider = BlockedTargetContext.Provider;

export const useBlockedTarget = (): string | null => useContext(BlockedTargetContext);
