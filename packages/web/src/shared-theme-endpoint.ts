// Shared by the two Node hosts and by the browser, like BOARD_EVENTS_ENDPOINT.
//
// Board-scoped in its URL so the page builds every endpoint from one prefix,
// though its answer is the same for every board the process serves.
export const SHARED_THEME_ENDPOINT = '/api/shared-theme';

// Sent on every open board stream when the configuration directory changes.
export const SHARED_CONFIG_CHANGED_EVENT = 'shared-config-changed';
