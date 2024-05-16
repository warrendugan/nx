import {
  isWholeFileChange,
  WholeFileChange,
} from '../../../../project-graph/file-utils';
import {
  JsonDiffType,
  isJsonChange,
  JsonChange,
} from '../../../../utils/json-diff';
import { logger } from '../../../../utils/logger';
import { TouchedProjectLocator } from '../../../../project-graph/affected/affected-project-graph-models';
import {
  ProjectGraphExternalNode,
  ProjectGraphProjectNode,
} from '../../../../config/project-graph';
import { NxJsonConfiguration } from '../../../../config/nx-json';

export const getTouchedNpmPackages: TouchedProjectLocator<
  WholeFileChange | JsonChange
> = (touchedFiles, _, nxJson, packageJson, projectGraph): string[] => {
  const packageJsonChange = touchedFiles.find((f) => f.file === 'package.json');
  if (!packageJsonChange) return [];

  const globalPackages = new Set(getGlobalPackages(nxJson.plugins));

  let touched = [];
  const changes = packageJsonChange.getChanges();

  const npmPackages = Object.values(projectGraph.externalNodes);

  const missingTouchedNpmPackages: string[] = [];

  for (const c of changes) {
    if (
      isJsonChange(c) &&
      (c.path[0] === 'dependencies' || c.path[0] === 'devDependencies') &&
      c.path.length === 2
    ) {
      // A package was deleted so mark all workspace projects as touched.
      if (c.type === JsonDiffType.Deleted) {
        touched = Object.keys(projectGraph.nodes);
        break;
      } else {
        let npmPackage: ProjectGraphProjectNode | ProjectGraphExternalNode =
          npmPackages.find((pkg) => pkg.data.packageName === c.path[1]);
        if (!npmPackage) {
          // dependency can also point to a workspace project
          const nodes = Object.values(projectGraph.nodes);
          npmPackage = nodes.find((n) => n.name === c.path[1]);
        }
        if (!npmPackage) {
          missingTouchedNpmPackages.push(c.path[1]);
          continue;
        }
        touched.push(npmPackage.name);
        // If it was a type declarations package then also mark its corresponding implementation package as affected
        if (npmPackage.name.startsWith('npm:@types/')) {
          const implementationNpmPackage = npmPackages.find(
            (pkg) => pkg.data.packageName === c.path[1].substring(7)
          );
          if (implementationNpmPackage) {
            touched.push(implementationNpmPackage.name);
          }
        }

        if ('packageName' in npmPackage.data) {
          if (globalPackages.has(npmPackage.data.packageName)) {
            touched.push(...Object.keys(projectGraph.nodes));
          }
        }
      }
    } else if (isWholeFileChange(c)) {
      // Whole file was touched, so all npm packages are touched.
      touched = npmPackages.map((pkg) => pkg.name);
      break;
    }
  }

  if (missingTouchedNpmPackages.length) {
    logger.warn(
      `The affected projects might have not been identified properly. The package(s) ${missingTouchedNpmPackages.join(
        ', '
      )} were not found. Please open an issue in GitHub including the package.json file.`
    );
  }
  return touched;
};

function getGlobalPackages(plugins: NxJsonConfiguration['plugins']) {
  return (plugins ?? [])
    .map((p) => getPackageName(typeof p === 'string' ? p : p.plugin))
    .concat('nx');
}

//# Converts import paths to package names.
//# e.g. - `@nx/workspace`        -> `@nx/workspace`
//#      - `@nx/workspace/plugin` -> `@nx/workspace`
//#      - `@nx/workspace/other`  -> `@nx/workspace`
//#      - `nx/plugin`            -> `nx`
export function getPackageName(name: string) {
  if (name.startsWith('@')) {
    return name.split('/').slice(0, 2).join('/');
  }
  return name.split('/')[0];
}
