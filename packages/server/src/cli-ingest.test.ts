import { describe, expect, it } from 'vitest';
import { parseCliArgs } from './cli-ingest.js';

describe('parseCliArgs', () => {
  it('should parse valid args', () => {
    const args = parseCliArgs([
      '--file',
      'test.json',
      '--graph',
      'myGraph',
      '--format',
      'text',
      '--concurrency',
      '3',
      '--verbose',
    ]);

    expect(args.file).toBe('test.json');
    expect(args.graph).toBe('myGraph');
    expect(args.format).toBe('text');
    expect(args.concurrency).toBe(3);
    expect(args.verbose).toBe(true);
  });

  it('should return undefined file when --file is missing', () => {
    const args = parseCliArgs([]);
    expect(args.file).toBeUndefined();
  });

  it('should use defaults (format=auto, concurrency=1, verbose=false)', () => {
    const args = parseCliArgs(['--file', 'data.txt']);

    expect(args.file).toBe('data.txt');
    expect(args.graph).toBeUndefined();
    expect(args.format).toBe('auto');
    expect(args.concurrency).toBe(1);
    expect(args.verbose).toBe(false);
  });
});
