export { App } from './App';
export { useBoardStore } from './store';
// The Electron shell hides the shared Settings dialog but still needs this one
// board-scoped control in its own settings popover.
export { WipLimitField } from './components/WipLimitField';
export { MultipleActiveReleasesField } from './components/MultipleActiveReleasesField';
export { GitIntegrationField } from './components/GitIntegrationField';
// Same reason: the desktop settings panel shows the CLI hint the dialog carries.
export { CliHint } from './components/CliHint';
