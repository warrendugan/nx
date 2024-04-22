/* eslint-disable @nx/enforce-module-boundaries */
// nx-ignore-next-line
import type { ProjectGraphProjectNode } from '@nx/devkit';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { connect } from 'react-redux';
import {
  getExternalApiService,
  useEnvironmentConfig,
  useRouteConstructor,
} from '@nx/graph/shared';
import { ProjectDetails } from '@nx/graph/ui-project-details';
import { useCallback, useEffect } from 'react';
import {
  mapStateToProps,
  mapDispatchToProps,
  mapStateToPropsType,
  mapDispatchToPropsType,
} from './project-details-wrapper.state';

type ProjectDetailsProps = mapStateToPropsType &
  mapDispatchToPropsType & {
    project: ProjectGraphProjectNode;
    sourceMap: Record<string, string[]>;
  };

export function ProjectDetailsWrapperComponent({
  project,
  sourceMap,
  setExpandTargets,
  expandTargets,
  collapseAllTargets,
}: ProjectDetailsProps) {
  const environment = useEnvironmentConfig()?.environment;
  const externalApiService = getExternalApiService();
  const navigate = useNavigate();
  const routeConstructor = useRouteConstructor();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleViewInProjectGraph = useCallback(
    (data: { projectName: string }) => {
      if (environment === 'nx-console') {
        externalApiService.postEvent({
          type: 'open-project-graph',
          payload: {
            projectName: data.projectName,
          },
        });
      } else {
        navigate(
          routeConstructor(
            `/projects/${encodeURIComponent(data.projectName)}`,
            true
          )
        );
      }
    },
    [externalApiService, routeConstructor, navigate, environment]
  );

  const handleViewInTaskGraph = useCallback(
    (data: { projectName: string; targetName: string }) => {
      if (environment === 'nx-console') {
        externalApiService.postEvent({
          type: 'open-task-graph',
          payload: {
            projectName: data.projectName,
            targetName: data.targetName,
          },
        });
      } else {
        navigate(
          routeConstructor(
            {
              pathname: `/tasks/${encodeURIComponent(data.targetName)}`,
              search: `?projects=${encodeURIComponent(data.projectName)}`,
            },
            true
          )
        );
      }
    },
    [externalApiService, routeConstructor, navigate, environment]
  );

  const handleRunTarget = useCallback(
    (data: { projectName: string; targetName: string }) => {
      externalApiService.postEvent({
        type: 'run-task',
        payload: { taskId: `${data.projectName}:${data.targetName}` },
      });
    },
    [externalApiService]
  );

  const updateSearchParams = (
    params: URLSearchParams,
    targetNames: string[]
  ) => {
    if (targetNames.length === 0) {
      params.delete('targetName');
    } else {
      params.set('targetName', targetNames.join(','));
    }
  };

  useEffect(() => {
    if (!project.data.targets) return;

    const expandedTargetsParams = searchParams.get('targetName')?.split(',');
    if (expandedTargetsParams && expandedTargetsParams.length > 0) {
      setExpandTargets(expandedTargetsParams);
    }

    return () => {
      collapseAllTargets();
      searchParams.delete('targetName');
      setSearchParams(searchParams, { replace: true });
    };
  }, []); // only run on mount

  useEffect(() => {
    if (!project.data.targets) return;

    const expandedTargetsParams =
      searchParams.get('targetName')?.split(',') || [];

    if (expandedTargetsParams.join(',') === expandTargets.join(',')) {
      return;
    }

    setSearchParams(
      (currentSearchParams) => {
        updateSearchParams(currentSearchParams, expandTargets);
        return currentSearchParams;
      },
      { replace: true, preventScrollReset: true }
    );
  }, [
    expandTargets,
    project.data.targets,
    setExpandTargets,
    searchParams,
    setSearchParams,
  ]);

  return (
    <ProjectDetails
      project={project}
      sourceMap={sourceMap}
      onViewInProjectGraph={handleViewInProjectGraph}
      onViewInTaskGraph={handleViewInTaskGraph}
      onRunTarget={environment === 'nx-console' ? handleRunTarget : undefined}
    />
  );
}

export const ProjectDetailsWrapper = connect(
  mapStateToProps,
  mapDispatchToProps
)(ProjectDetailsWrapperComponent);
export default ProjectDetailsWrapper;
