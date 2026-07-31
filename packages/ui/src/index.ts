export { App } from './App';
export { useBoardStore } from './store';
// The Electron shell hides the shared Settings dialog but still needs this one
// board-scoped control in its own settings popover.
export { WipLimitField } from './components/WipLimitField';
