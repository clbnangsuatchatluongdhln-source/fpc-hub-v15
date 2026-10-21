import { Store } from '@/core/store';
import {
  renderProjects,
  openProjectDetail as _openProjectDetail,
  closeProjectDetail,
  ProjectState,
} from './project-ui';
import { fetchProjects } from './project-service';
import type { Project } from './types';

/* ─────────────────────────────────────────────
   STORE ADAPTER
   ───────────────────────────────────────────── */
interface StoreLike {
  patch(p: Record<string, unknown>): void;
}
const S = Store as unknown as StoreLike;

/* ─────────────────────────────────────────────
   INIT
   ───────────────────────────────────────────── */
export function initProjectsFeature(): void {
  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderProjects(searchInput.value);
    });
  }

  void loadProjectsIntoStore();
}

async function loadProjectsIntoStore(): Promise<void> {
  try {
    const projects = await fetchProjects();
    if (projects.length > 0) {
      S.patch({ projects });
      console.log(`✅ Loaded ${projects.length} projects`);
    }
  } catch (err) {
    console.error('Load projects failed:', err);
  }
}

/* ─────────────────────────────────────────────
   PUBLIC API
   ───────────────────────────────────────────── */
export async function openProjectDetail(projectId: string): Promise<void> {
  await _openProjectDetail(projectId);
}

export { renderProjects, closeProjectDetail, ProjectState };
export type { Project };
