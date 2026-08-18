import { createContext, useContext } from 'react';

// While a drag is running, the targets the board would refuse. A set rather than
// one value because the backlog shows every active release at once and each
// counts its own In Progress column. Drag state is view state, so it travels
// down through context rather than through the store.
export const NO_BLOCKED_TARGETS: ReadonlySet<string> = new Set<string>();

const BlockedTargetContext = createContext<ReadonlySet<string>>(NO_BLOCKED_TARGETS);

export const BlockedTargetProvider = BlockedTargetContext.Provider;

export const useBlockedTargets = (): ReadonlySet<string> => useContext(BlockedTargetContext);
