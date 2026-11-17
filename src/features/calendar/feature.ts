import type { Feature } from '../../core/registry';
import { initCalendarFeature, destroyCalendarFeature } from './index';

const SECTION_ID = 'timelineSection';

function hideAllSections(): void {
  ['timelineSection', 'projectsSection', 'departmentsSection', 'adminSection', 'tasksSection'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function setPageTitle(title: string): void {
  const el = document.getElementById('pageTitle');
  if (el) el.textContent = title;
}

export const calendarFeature: Feature = {
  id: 'calendar',
  route: '/',
  async mount() {
    hideAllSections();
    document.getElementById(SECTION_ID)?.classList.remove('hidden');
    setPageTitle('Lịch');

    await initCalendarFeature({
      onQuickUpload: async (eventId) => {
        window.dispatchEvent(new CustomEvent('fpc:quick-upload', { detail: { eventId } }));
      },
    });

    return () => {
      destroyCalendarFeature();
    };
  },
};
