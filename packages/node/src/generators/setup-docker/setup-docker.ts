import {
  formatFiles,
  generateFiles,
  GeneratorCallback,
  joinPathFragments,
  logger,
  readNxJson,
  readProjectConfiguration,
  runTasksInSerial,
  Tree,
  updateProjectConfiguration,
} from '@nx/devkit';

import { SetUpDockerOptions } from './schema';
import { join } from 'path';
import { interpolate } from 'nx/src/tasks-runner/utils';

function normalizeOptions(
  tree: Tree,
  setupOptions: SetUpDockerOptions
): SetUpDockerOptions {
  return {
    ...setupOptions,
    project: setupOptions.project ?? readNxJson(tree).defaultProject,
    targetName: setupOptions.targetName ?? 'docker-build',
    buildTarget: setupOptions.buildTarget ?? 'build',
  };
}

function addDocker(tree: Tree, options: SetUpDockerOptions) {
  const projectConfig = readProjectConfiguration(tree, options.project);

  if (
    !projectConfig ||
    !projectConfig.targets ||
    !projectConfig.targets[options.buildTarget]
  ) {
    throw new Error(
      `Could not find the project ${options.project} or the build target ${options.buildTarget} in the workspace.`
    );
  }

  // Returns an string like {workspaceRoot}/dist/apps/{projectName}
  // Non crystalized projects would return {options.outputPath}
  const tokenizedOutputPath =
    projectConfig.targets[`${options.buildTarget}`]?.outputs?.[0];
  const maybeBuildOptions =
    projectConfig.targets[`${options.buildTarget}`]?.options;

  if (tree.exists(joinPathFragments(projectConfig.root, 'DockerFile'))) {
    logger.info(
      `Skipping setup since a Dockerfile already exists inside ${projectConfig.root}`
    );
  } else if (!tokenizedOutputPath) {
    logger.error(
      `Skipping setup since the output path for the build target ${options.buildTarget} is not defined.`
    );
  } else {
    const outputPath = interpolate(tokenizedOutputPath, {
      projectName: projectConfig.name,
      projectRoot: projectConfig.root,
      workspaceRoot: '',
      options: maybeBuildOptions || '',
    });

    generateFiles(tree, join(__dirname, './files'), projectConfig.root, {
      tmpl: '',
      app: projectConfig.sourceRoot,
      buildLocation: outputPath,
      project: options.project,
    });
  }
}

export function updateProjectConfig(tree: Tree, options: SetUpDockerOptions) {
  let projectConfig = readProjectConfiguration(tree, options.project);

  projectConfig.targets[`${options.targetName}`] = {
    dependsOn: [`${options.buildTarget}`],
    command: `docker build -f ${joinPathFragments(
      projectConfig.root,
      'Dockerfile'
    )} . -t ${options.project}`,
  };

  updateProjectConfiguration(tree, options.project, projectConfig);
}

export async function setupDockerGenerator(
  tree: Tree,
  setupOptions: SetUpDockerOptions
) {
  const tasks: GeneratorCallback[] = [];
  const options = normalizeOptions(tree, setupOptions);
  // Should check if the node project exists
  addDocker(tree, options);
  updateProjectConfig(tree, options);

  if (!options.skipFormat) {
    await formatFiles(tree);
  }

  return runTasksInSerial(...tasks);
}

export default setupDockerGenerator;
