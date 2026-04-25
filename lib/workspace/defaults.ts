/**
 * Initial service catalog seeded into a freshly-created workspace.
 * Workspace admins can add/remove from /app/settings/workspace.
 *
 * Existing workspaces also get this list via the 0021 migration's
 * UPDATE backfill so the editor doesn't load empty for current users.
 */
export const DEFAULT_WORKSPACE_SERVICES: string[] = [
  "Growth",
  "Marketing",
  "Sherpa",
  "Reingeniera Comercial",
  "AI",
  "Black Opps",
  "Seleccion",
  "People",
];
