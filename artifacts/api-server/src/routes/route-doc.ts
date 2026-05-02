/**
 * Shared type for the documentation category that every *.meta.ts exports
 * alongside its ROUTES registry.
 *
 * See register.ts for the RouteEntry / RouteRegistry types and the full
 * workflow for adding new endpoints.
 */
export interface RouteDocCategory {
  id: string;
  title: string;
  description: string;
  /** Controls display order in the docs page. Lower = first. */
  order: number;
}
