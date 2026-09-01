// Shared by the dev middleware, the boardown-web server and the browser-side
// reader, the way PROJECT_FILE_ENDPOINT is. Deliberately outside /api/fs, which
// stays board-scoped: this one reads the repository around the project folder.
export const GIT_COMMITS_ENDPOINT = '/api/git/commits';
