import { dirname, join, resolve } from 'path';
import { ExecutorContext } from '@nx/devkit';

import type { RollupExecutorOptions } from '../schema';

export interface NormalizedRollupExecutorOptions extends RollupExecutorOptions {
  projectRoot: string;
  rollupConfig: string[];
}

export function normalizeRollupExecutorOptions(
  options: RollupExecutorOptions,
  context: ExecutorContext
): NormalizedRollupExecutorOptions {
  const { root } = context;
  const project = options.project
    ? `${root}/${options.project}`
    : join(root, 'package.json');
  const projectRoot = dirname(project);
  return {
    ...options,
    rollupConfig: []
      .concat(options.rollupConfig)
      .filter(Boolean)
      .map((p) => normalizePluginPath(p, root)),
    project,
    projectRoot,
    skipTypeCheck: options.skipTypeCheck || false,
  };
}

export function normalizePluginPath(pluginPath: void | string, root: string) {
  if (!pluginPath) {
    return '';
  }
  try {
    return require.resolve(pluginPath);
  } catch {
    return resolve(root, pluginPath);
  }
}
