import type { AppServices } from './services';

export type CleanupFn = () => void;

export interface Feature {
  id: string;
  route: string;
  mount: (
    container: HTMLElement,
    services: AppServices,
    signal: AbortSignal,
  ) => void | CleanupFn | Promise<void | CleanupFn>;
}

const registry = new Map<string, Feature>();

export function registerFeature(feature: Feature): void {
  if (registry.has(feature.route)) {
    throw new Error(`Route đã được đăng ký: ${feature.route}`);
  }
  registry.set(feature.route, feature);
}

export function unregisterFeature(route: string): void {
  registry.delete(route);
}

export function clearRegistry(): void {
  registry.clear();
}

export function getFeature(route: string): Feature | undefined {
  return registry.get(route);
}

export function getAllRoutes(): string[] {
  return Array.from(registry.keys());
}
