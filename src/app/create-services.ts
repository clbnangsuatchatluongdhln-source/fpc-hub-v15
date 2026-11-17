import { Auth } from '../core/auth';
import { supabase } from '../core/supabase';
import { emit, on } from '../core/events';
import { navigate } from '../core/router';
import { Toast } from '../ui/toast';
import { Modal } from '../ui/modal';
import type { AppServices, UserRole } from '../core/services';

export function createAppServices(): AppServices {
  return {
    supabase,
    userId: Auth.user?.id ?? null,
    getUser: () => Auth.profile,
    getRole: () => (Auth.profile?.role as UserRole | undefined) ?? 'member',
    notify: (msg, type = 'info') => {
      Toast.show(msg, { type });
    },
    navigate: (path) => navigate(path),
    events: {
      emit: (name, detail) => emit(name, detail),
      on: (name, handler) => on(name, handler),
    },
    modal: {
      open: (id, trigger, buildFn) => Modal.open(id, trigger, buildFn),
      close: (id) => Modal.close(id),
      confirm: (message) => window.confirm(message),
    },
  };
}
