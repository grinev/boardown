// The one capability outside `FsAdapter` that writes: a copy the user asked for,
// to a place the user picks in the host's own dialog (a Save-as dialog, the
// browser's download). It is never handed a board or project path. Cancelling
// the dialog resolves quietly.
export interface FileSaver {
  save(name: string, content: Uint8Array): Promise<void>;
}
