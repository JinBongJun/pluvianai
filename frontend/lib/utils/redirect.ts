/**
 * Utility function to redirect from old dashboard paths to new org-based paths
 */
import { projectsAPI } from '@/lib/api';

export async function redirectProjectPath(
  projectId: number,
  subPath: string = '',
  router: any
): Promise<void> {
  try {
    const project = await projectsAPI.get(projectId);
    
    if (project.organization_id) {
      const newPath = `/organizations/${project.organization_id}/projects/${projectId}${subPath ? `/${subPath}` : ''}`;
      router.push(newPath);
    } else {
      // Project has no org, redirect to organizations list
      router.push('/organizations');
    }
  } catch (error) {
    console.error('Failed to redirect project path:', error);
    router.push('/organizations');
  }
}
