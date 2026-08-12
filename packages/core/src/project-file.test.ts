import { describe, expect, it } from 'vitest';
import {
  PROJECT_FILE_MAX_BYTES,
  classifyProjectFile,
  projectFileName,
  projectFilePathFromRefToken,
} from './project-file.js';

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('projectFilePathFromRefToken', () => {
  it('takes a plain project-relative path', () => {
    expect(projectFilePathFromRefToken('repo:packages/cli/src/node-fs.ts')).toBe(
      'packages/cli/src/node-fs.ts',
    );
  });

  it('ignores a token without the prefix', () => {
    expect(projectFilePathFromRefToken('guides/release-process')).toBeNull();
    expect(projectFilePathFromRefToken('repository-notes')).toBeNull();
  });

  it('reads a rooted path as project-root-relative', () => {
    expect(projectFilePathFromRefToken('repo:/src/app.ts')).toBe('src/app.ts');
    expect(projectFilePathFromRefToken('repo:/etc/passwd')).toBe('etc/passwd');
    expect(projectFilePathFromRefToken('repo:\\\\server\\share\\x.txt')).toBe(
      'server/share/x.txt',
    );
  });

  it('normalizes backslashes and dot segments', () => {
    expect(projectFilePathFromRefToken('repo:packages\\cli\\src\\app.ts')).toBe(
      'packages/cli/src/app.ts',
    );
    expect(projectFilePathFromRefToken('repo:./src/app.ts')).toBe('src/app.ts');
    expect(projectFilePathFromRefToken('repo:src//app.ts')).toBe('src/app.ts');
    expect(projectFilePathFromRefToken('repo:src/')).toBe('src');
  });

  it('trims whitespace around the path', () => {
    expect(projectFilePathFromRefToken('repo:  src/app.ts  ')).toBe('src/app.ts');
  });

  // Normalization does not judge the path: an escape stays a link and the host
  // refuses it on click, so the user is told rather than left with dead text.
  it('passes an escaping path through for the host to refuse', () => {
    expect(projectFilePathFromRefToken('repo:../secrets')).toBe('../secrets');
    expect(projectFilePathFromRefToken('repo:src/../../secrets')).toBe('src/../../secrets');
    expect(projectFilePathFromRefToken('repo:C:\\Windows\\win.ini')).toBe(
      'C:/Windows/win.ini',
    );
  });

  it('rejects an empty path', () => {
    expect(projectFilePathFromRefToken('repo:')).toBeNull();
    expect(projectFilePathFromRefToken('repo:   ')).toBeNull();
    expect(projectFilePathFromRefToken('repo:/')).toBeNull();
    expect(projectFilePathFromRefToken('repo:./')).toBeNull();
  });
});

describe('projectFileName', () => {
  it('is the last segment', () => {
    expect(projectFileName('packages/cli/src/node-fs.ts')).toBe('node-fs.ts');
    expect(projectFileName('README.md')).toBe('README.md');
    expect(projectFileName('Dockerfile')).toBe('Dockerfile');
  });
});

describe('classifyProjectFile', () => {
  it('decodes utf-8 text', () => {
    expect(classifyProjectFile(bytes('const a = 1;\nтекст\n'))).toEqual({
      kind: 'text',
      text: 'const a = 1;\nтекст\n',
    });
  });

  it('accepts an empty file', () => {
    expect(classifyProjectFile(new Uint8Array(0))).toEqual({ kind: 'text', text: '' });
  });

  it('strips a byte order mark', () => {
    expect(classifyProjectFile(bytes('\ufeff# Title'))).toEqual({
      kind: 'text',
      text: '# Title',
    });
  });

  it('rejects content holding a NUL byte', () => {
    expect(classifyProjectFile(new Uint8Array([0x50, 0x4e, 0x47, 0x00, 0x1a]))).toEqual({
      kind: 'binary',
    });
  });

  it('rejects bytes that are not valid utf-8', () => {
    expect(classifyProjectFile(new Uint8Array([0xff, 0xfe, 0x41, 0x42]))).toEqual({
      kind: 'binary',
    });
  });

  it('takes a file exactly at the cap and refuses one byte more', () => {
    expect(classifyProjectFile(new Uint8Array(PROJECT_FILE_MAX_BYTES).fill(0x61)).kind).toBe(
      'text',
    );
    expect(
      classifyProjectFile(new Uint8Array(PROJECT_FILE_MAX_BYTES + 1).fill(0x61)),
    ).toEqual({ kind: 'too-large' });
  });
});
