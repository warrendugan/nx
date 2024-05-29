import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  addProjectConfiguration,
  type ProjectConfiguration,
  readProjectConfiguration,
  type Tree,
} from '@nx/devkit';
import convertToInferred from './convert-to-inferred';

interface CreateProjectOptions {
  name: string;
  root: string;
  targetName: string;
  targetOptions: Record<string, unknown>;
  targetOutputs: string[];
  targetInputs?: string[];
  additionalTargetProperties?: Record<string, unknown>;
}

const defaultCreateProjectOptions: CreateProjectOptions = {
  name: 'mypkg',
  root: 'mypkg',
  targetName: 'build',
  targetOptions: {},
  targetOutputs: ['{options.outputPath}'],
};

function createProject(tree: Tree, opts: Partial<CreateProjectOptions> = {}) {
  const projectOpts = {
    ...defaultCreateProjectOptions,
    ...opts,
    targetOptions: { ...opts.targetOptions },
  };

  projectOpts.targetOptions.main ??= `${projectOpts.root}/src/index.ts`;
  projectOpts.targetOptions.outputPath ??= `dist/${projectOpts.root}`;
  projectOpts.targetOptions.tsConfig ??= `${projectOpts.root}/tsconfig.lib.json`;
  projectOpts.targetOptions.compiler ??= 'babel';
  projectOpts.targetOptions.format ??= ['esm'];
  projectOpts.targetOptions.external ??= [];
  projectOpts.targetOptions.assets ??= [];

  const project: ProjectConfiguration = {
    name: projectOpts.name,
    root: projectOpts.root,
    projectType: 'library',
    targets: {
      [projectOpts.targetName]: {
        executor: '@nx/rollup:rollup',
        outputs: projectOpts.targetOutputs ?? ['{options.outputPath}'],
        options: projectOpts.targetOptions,
        ...projectOpts.additionalTargetProperties,
      },
    },
  };

  addProjectConfiguration(tree, project.name, project);

  return project;
}

describe('Rollup - Convert Executors To Plugin', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  describe('--project', () => {
    it('should setup a new Rollup plugin and only migrate one specific project', async () => {
      const project = createProject(tree, {
        name: 'mypkg',
        root: 'mypkg',
      });
      createProject(tree, {
        name: 'otherpkg1',
        root: 'otherpkg1',
      });
      createProject(tree, {
        name: 'otherpkg2',
        root: 'otherpkg2',
      });

      await convertToInferred(tree, { project: project.name });

      expect(tree.read('mypkg/rollup.config.js', 'utf-8'))
        .toMatchInlineSnapshot(`
        "const { withNx } = require('@nx/rollup/with-nx');

        // These options were migrated by @nx/rollup:convert-to-inferred from project.json.
        const options = {
          main: './src/index.ts',
          outputPath: '../dist/mypkg',
          tsConfig: './tsconfig.lib.json',
          compiler: 'babel',
          format: ['esm'],
          external: [],
          assets: [],
        };

        const config = withNx(options, {
          // Provide additional rollup configuration here. See: https://rollupjs.org/configuration-options
          // e.g.
          // output: { sourcemap: true },
        });

        module.exports = config;
        "
      `);
      expect(tree.exists('otherpkg1/rollup.config.js')).toBe(false);
      expect(tree.exists('otherpkg2/rollup.config.js')).toBe(false);
      expect(readProjectConfiguration(tree, project.name).targets).toEqual({});
    });

    it('should support existing rollupConfig files', async () => {
      const projectWithSingleConfig = createProject(tree, {
        name: 'mypkg1',
        root: 'mypkg1',
        targetOptions: {
          rollupConfig: '@nx/react/plugins/bundle-rollup',
        },
      });
      const projectWithMultipleConfigsAndEntries = createProject(tree, {
        name: 'mypkg2',
        root: 'mypkg2',
        targetOptions: {
          additionalEntryPoints: ['mypkg2/src/foo.ts', 'mypkg2/src/bar.ts'],
          rollupConfig: [
            '@nx/react/plugins/bundle-rollup',
            'mypkg2/rollup.config.js',
            'mypkg2/rollup.config.other.js',
            'shared/rollup.config.base.js',
          ],
        },
      });

      await convertToInferred(tree, { project: projectWithSingleConfig.name });
      await convertToInferred(tree, {
        project: projectWithMultipleConfigsAndEntries.name,
      });

      expect(tree.read('mypkg1/rollup.config.js', 'utf-8'))
        .toMatchInlineSnapshot(`
        "const { withNx } = require('@nx/rollup/with-nx');

        // These options were migrated by @nx/rollup:convert-to-inferred from project.json.
        const options = {
          main: './src/index.ts',
          outputPath: '../dist/mypkg1',
          tsConfig: './tsconfig.lib.json',
          compiler: 'babel',
          format: ['esm'],
          external: [],
          assets: [],
        };

        const config = withNx(options, {
          // Provide additional rollup configuration here. See: https://rollupjs.org/configuration-options
          // e.g.
          // output: { sourcemap: true },
        });

        config = require('@nx/react/plugins/bundle-rollup')(config, options);

        module.exports = config;
        "
      `);
      expect(tree.read('mypkg2/rollup.config.js', 'utf-8'))
        .toMatchInlineSnapshot(`
        "const { withNx } = require('@nx/rollup/with-nx');

        // These options were migrated by @nx/rollup:convert-to-inferred from project.json.
        const options = {
          additionalEntryPoints: ['./src/foo.ts', './src/bar.ts'],
          main: './src/index.ts',
          outputPath: '../dist/mypkg2',
          tsConfig: './tsconfig.lib.json',
          compiler: 'babel',
          format: ['esm'],
          external: [],
          assets: [],
        };

        let config = withNx(options, {
          // Provide additional rollup configuration here. See: https://rollupjs.org/configuration-options
          // e.g.
          // output: { sourcemap: true },
        });

        config = require('@nx/react/plugins/bundle-rollup')(config, options);
        config = require('./rollup.config.js')(config, options);
        config = require('./rollup.config.other.js')(config, options);
        config = require('../shared/rollup.config.base.js')(config, options);

        module.exports = config;
        "
      `);

      expect(
        readProjectConfiguration(tree, projectWithSingleConfig.name).targets
      ).toEqual({});
      expect(
        readProjectConfiguration(
          tree,
          projectWithMultipleConfigsAndEntries.name
        ).targets
      ).toEqual({});
    });

    it('should migrate existing outputs to include output from rollup config', async () => {
      const project = createProject(tree, {
        name: 'mypkg',
        root: 'mypkg',
        targetOutputs: [
          '{options.outputPath}',
          '{projectRoot}/other-artifacts',
        ],
      });

      await convertToInferred(tree, { project: project.name });

      expect(readProjectConfiguration(tree, project.name).targets).toEqual({
        build: {
          outputs: [
            '{projectRoot}/../dist/mypkg',
            '{projectRoot}/other-artifacts',
          ],
        },
      });
    });

    it('should leave custom inputs, dependsOn, etc. intact', async () => {
      const project = createProject(tree, {
        name: 'mypkg',
        root: 'mypkg',
        additionalTargetProperties: {
          inputs: [
            'production',
            { env: 'CI' },
            { externalDependencies: ['rollup'] },
          ],
          dependsOn: ['^build', 'build-base'],
        },
      });

      await convertToInferred(tree, { project: project.name });

      expect(readProjectConfiguration(tree, project.name).targets).toEqual({
        build: {
          inputs: [
            'production',
            { env: 'CI' },
            { externalDependencies: ['rollup'] },
          ],
          dependsOn: ['^build', 'build-base'],
        },
      });
    });

    it('should Rollup CLI as external dependency in inputs if not already present', async () => {
      const project1 = createProject(tree, {
        name: 'mypkg1',
        root: 'mypkg1',
        additionalTargetProperties: {
          inputs: ['production', { env: 'CI' }],
        },
      });

      const project2 = createProject(tree, {
        name: 'mypkg2',
        root: 'mypkg2',
        additionalTargetProperties: {
          inputs: [
            'production',
            { env: 'CI' },
            { externalDependencies: ['foo'] },
          ],
        },
      });

      await convertToInferred(tree, { project: project1.name });
      await convertToInferred(tree, { project: project2.name });

      expect(readProjectConfiguration(tree, project1.name).targets).toEqual({
        build: {
          inputs: [
            'production',
            { env: 'CI' },
            { externalDependencies: ['rollup'] },
          ],
        },
      });
      expect(readProjectConfiguration(tree, project2.name).targets).toEqual({
        build: {
          inputs: [
            'production',
            { env: 'CI' },
            { externalDependencies: ['foo', 'rollup'] },
          ],
        },
      });
    });

    it('should extract configurations as separate rollup files', async () => {
      const project = createProject(tree, {
        name: 'mypkg',
        root: 'mypkg',
        additionalTargetProperties: {
          defaultConfiguration: 'foo',
          configurations: {
            foo: {
              watch: true,
              main: 'mypkg/src/foo.ts',
            },
            bar: {
              watch: false,
              main: 'mypkg/src/bar.ts',
            },
          },
        },
      });

      await convertToInferred(tree, { project: project.name });

      expect(tree.read('mypkg/rollup.foo.config.js', 'utf-8'))
        .toMatchInlineSnapshot(`
        "const { withNx } = require('@nx/rollup/with-nx');

        // These options were migrated by @nx/rollup:convert-to-inferred from project.json.
        const options = {
          main: './src/foo.ts',
          outputPath: '../dist/mypkg',
          tsConfig: './tsconfig.lib.json',
          compiler: 'babel',
          format: ['esm'],
          external: [],
          assets: [],
        };

        const config = withNx(options, {
          // Provide additional rollup configuration here. See: https://rollupjs.org/configuration-options
          // e.g.
          // output: { sourcemap: true },
        });

        module.exports = config;
        "
      `);
      expect(tree.read('mypkg/rollup.bar.config.js', 'utf-8'))
        .toMatchInlineSnapshot(`
        "const { withNx } = require('@nx/rollup/with-nx');

        // These options were migrated by @nx/rollup:convert-to-inferred from project.json.
        const options = {
          main: './src/bar.ts',
          outputPath: '../dist/mypkg',
          tsConfig: './tsconfig.lib.json',
          compiler: 'babel',
          format: ['esm'],
          external: [],
          assets: [],
        };

        const config = withNx(options, {
          // Provide additional rollup configuration here. See: https://rollupjs.org/configuration-options
          // e.g.
          // output: { sourcemap: true },
        });

        module.exports = config;
        "
      `);
      expect(readProjectConfiguration(tree, project.name).targets).toEqual({
        build: {
          configurations: {
            bar: {
              config: 'rollup.bar.config.js',
              watch: false,
            },
            foo: {
              config: 'rollup.foo.config.js',
              watch: true,
            },
          },
          defaultConfiguration: 'foo',
        },
      });
    });
  });

  describe('--all', () => {
    it('should successfully migrate projects using Rollup executors to plugin', async () => {
      createProject(tree, {
        name: 'pkg1',
        root: 'pkg1',
      });
      createProject(tree, {
        name: 'pkg2',
        root: 'pkg2',
      });

      await convertToInferred(tree, { all: true });

      expect(tree.read('pkg1/rollup.config.js', 'utf-8'))
        .toMatchInlineSnapshot(`
        "const { withNx } = require('@nx/rollup/with-nx');

        // These options were migrated by @nx/rollup:convert-to-inferred from project.json.
        const options = {
          main: './src/index.ts',
          outputPath: '../dist/pkg1',
          tsConfig: './tsconfig.lib.json',
          compiler: 'babel',
          format: ['esm'],
          external: [],
          assets: [],
        };

        const config = withNx(options, {
          // Provide additional rollup configuration here. See: https://rollupjs.org/configuration-options
          // e.g.
          // output: { sourcemap: true },
        });

        module.exports = config;
        "
      `);
      expect(tree.read('pkg2/rollup.config.js', 'utf-8'))
        .toMatchInlineSnapshot(`
        "const { withNx } = require('@nx/rollup/with-nx');

        // These options were migrated by @nx/rollup:convert-to-inferred from project.json.
        const options = {
          main: './src/index.ts',
          outputPath: '../dist/pkg2',
          tsConfig: './tsconfig.lib.json',
          compiler: 'babel',
          format: ['esm'],
          external: [],
          assets: [],
        };

        const config = withNx(options, {
          // Provide additional rollup configuration here. See: https://rollupjs.org/configuration-options
          // e.g.
          // output: { sourcemap: true },
        });

        module.exports = config;
        "
      `);
      expect(readProjectConfiguration(tree, 'pkg1').targets).toEqual({});
      expect(readProjectConfiguration(tree, 'pkg2').targets).toEqual({});
    });
  });
});
