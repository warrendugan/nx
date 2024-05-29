import { joinPathFragments, stripIndents, Tree } from '@nx/devkit';
import { RollupExecutorOptions } from '../../../executors/rollup/schema';
import { normalizePathOptions } from './normalize-path-options';

export function extractRollupConfigFromExecutorOptions(
  tree: Tree,
  options: RollupExecutorOptions,
  projectRoot: string,
  skipDefaults?: boolean,
  customName?: string
) {
  normalizePathOptions(projectRoot, options);

  const oldRollupConfig = Array.isArray(options.rollupConfig)
    ? options.rollupConfig
    : options.rollupConfig
    ? [options.rollupConfig]
    : [];
  delete options.rollupConfig;

  const pluginOptions: Record<string, unknown> = skipDefaults
    ? {}
    : {
        // Copy default non-false options from rollup executor, so if user did not set them we continue to use the defaults.
        format: ['esm'],
        deleteOutputPath: true,
        extractCss: true,
        assets: [],
        compiler: 'babel',
      };

  for (const [key, value] of Object.entries(options)) {
    if (key === 'watch') continue;
    delete options[key];
    pluginOptions[key] = value;
  }

  const newRollupConfigContent = stripIndents`
      const { withNx } = require('@nx/rollup/with-nx');
      
      // These options were migrated by @nx/rollup:convert-to-inferred from project.json.
      const options = ${JSON.stringify(pluginOptions, null, 2)};
      
      ${oldRollupConfig.length > 1 ? 'let' : 'const'} config = withNx(options, {
        // Provide additional rollup configuration here. See: https://rollupjs.org/configuration-options
        // e.g. 
        // output: { sourcemap: true },
      });
      
      ${oldRollupConfig
        // Normalize path
        .map((s) => `config = require('${s}')(config, options);`)
        .join('\n')}
      
      module.exports = config;
    `;

  const configFileName = customName ?? `rollup.config.js`;
  if (tree.exists(joinPathFragments(projectRoot, configFileName))) {
    throw new Error('conflict');
  }
  tree.write(
    joinPathFragments(projectRoot, configFileName),
    newRollupConfigContent
  );

  return pluginOptions;
}
