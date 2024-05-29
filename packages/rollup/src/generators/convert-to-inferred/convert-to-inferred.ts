import {
  formatFiles,
  getProjects,
  type Tree,
  updateProjectConfiguration,
} from '@nx/devkit';
import { forEachExecutorOptions } from '@nx/devkit/src/generators/executor-options-utils';

import { extractRollupConfigFromExecutorOptions } from './lib/extract-rollup-config-from-executor-options';
import { RollupExecutorOptions } from '../../executors/rollup/schema';

interface Schema {
  project?: string;
  all?: boolean;
  skipFormat?: boolean;
}

export async function convertToInferred(tree: Tree, options: Schema) {
  let migrated = 0;

  const projects = getProjects(tree);
  const originalDefaultOptions = new Map<string, RollupExecutorOptions>();

  forEachExecutorOptions<RollupExecutorOptions>(
    tree,
    '@nx/rollup:rollup',
    (currentTargetOptions, projectName, targetName, configurationName) => {
      if (!options.all && options.project && projectName !== options.project)
        return;

      const project = projects.get(projectName);
      const target = project.targets[targetName];
      console.log(
        projectName,
        targetName,
        configurationName,
        JSON.stringify(project, null, 2)
      );

      if (configurationName) {
        const originalOptions = originalDefaultOptions.get(projectName);
        const configFile = `rollup.${configurationName}.config.js`;
        const mergedOptions = {
          ...originalOptions,
          ...currentTargetOptions,
        };
        extractRollupConfigFromExecutorOptions(
          tree,
          // Make sure to take default options as well since we cannot easily extend from base.
          mergedOptions,
          project.root,
          true,
          configFile
        );
        mergedOptions['config'] = configFile;
        target.configurations[configurationName] = mergedOptions;
        updateProjectConfiguration(tree, projectName, project);
      } else {
        // Store this so subsequent configurations can still access the original default options.
        originalDefaultOptions.set(projectName, currentTargetOptions);
        const pluginOptions = extractRollupConfigFromExecutorOptions(
          tree,
          target.options,
          project.root,
          true,
          configurationName
        );

        // If rollup is not an external dependency, add it
        if (
          target.inputs &&
          !target.inputs.some(
            (i) =>
              Array.isArray(i['externalDependencies']) &&
              i['externalDependencies'].includes('rollup')
          )
        ) {
          const idx = target.inputs.findIndex((i) =>
            Array.isArray(i['externalDependencies'])
          );
          if (idx === -1) {
            target.inputs.push({ externalDependencies: ['rollup'] });
          } else {
            target.inputs[idx]['externalDependencies'].push('rollup');
          }
        }

        // Clean up the target now that it is inferred
        delete target.executor;
        if (
          target.outputs &&
          target.outputs.length === 1 &&
          // "{projectRoot}/{options.outputPath}" is an invalid output for Rollup since
          // there would be a mismatch between where the executor outputs to and where Nx caches.
          // If users have this set erroneously, then it will continue to not work.
          (target.outputs[0] === '{options.outputPath}' ||
            target.outputs[0] === '{workspaceRoot}/{options.outputPath}')
        ) {
          // If only the default `options.outputPath` is set as output, remove it and use path inferred from `rollup.config.js`.
          delete target.outputs;
        } else {
          // Otherwise, replace `options.outputPath` with what is inferred from `rollup.config.js`.
          target.outputs = target.outputs.map((output) =>
            // Again, "{projectRoot}/{options.outputPath}" is an invalid output for Rollup.
            output === '{options.outputPath}' ||
            output === '{workspaceRoot}/{options.outputPath}'
              ? `{projectRoot}/${pluginOptions.outputPath as string}`
              : output
          );
        }
        if (Object.keys(target.options).length === 0) {
          delete target.options;
        }
        if (Object.keys(target).length === 0) {
          delete project.targets[targetName];
        }
        updateProjectConfiguration(tree, projectName, project);
        migrated++;
      }
    }
  );

  if (migrated === 0) {
    throw new Error('Could not find any targets to migrate.');
  }

  if (!options.skipFormat) {
    await formatFiles(tree);
  }
}

export default convertToInferred;
