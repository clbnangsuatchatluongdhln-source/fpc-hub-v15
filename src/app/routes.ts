import { registerFeature } from '../core/registry';
import { calendarFeature } from '../features/calendar/feature';
import { projectsFeature } from '../features/projects/feature';
import { tasksFeature } from '../features/tasks/feature';
import { organizationFeature } from './organization-feature';
import { filesFeature } from '../features/files/feature';

export function registerAllFeatures(): void {
  registerFeature(calendarFeature);
  registerFeature(projectsFeature);
  registerFeature(tasksFeature);
  registerFeature(organizationFeature);
  registerFeature({ ...organizationFeature, id: 'organization-legacy', route: '/admin' });
  registerFeature(filesFeature);
}
