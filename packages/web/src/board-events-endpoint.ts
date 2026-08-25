// Shared by the two Node hosts and by the browser, the way PROJECT_FILE_ENDPOINT
// is. They live out here rather than in api/board-events, because everything
// else in that file is node:fs and node:http and the browser bundle must not
// pull the watcher in behind a constant.
//
// Board-scoped, so it follows the /b/<id>/ prefix like the rest of the board's
// endpoints.
export const BOARD_EVENTS_ENDPOINT = '/api/events';

// Which tab is asking. On the stream it is a query parameter — an EventSource
// cannot send headers — and on a write it is this header, so the /api/fs/*
// bodies stay the operation's own arguments.
export const CLIENT_ID_HEADER = 'x-boardown-client';
export const CLIENT_ID_PARAM = 'client';
