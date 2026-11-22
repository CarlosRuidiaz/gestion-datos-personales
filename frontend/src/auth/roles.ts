/** Roles del realm (sección 4.3 del diseño). Coinciden con `Rol` de libs/common. */
export const Rol = {
  ADMINISTRADOR: 'administrador',
  CONSULTOR: 'consultor',
} as const;
export type Rol = (typeof Rol)[keyof typeof Rol];

/** Se queda solo con los roles de la aplicación; Keycloak agrega otros (offline_access, etc.). */
export function rolesDeLaAplicacion(roles: readonly string[] | undefined): Rol[] {
  const validos: readonly string[] = Object.values(Rol);
  return (roles ?? []).filter((r): r is Rol => validos.includes(r));
}

export function nombreDelRol(roles: readonly Rol[]): string {
  if (roles.includes(Rol.ADMINISTRADOR)) return 'Administrador';
  if (roles.includes(Rol.CONSULTOR)) return 'Consultor';
  return 'Sin rol';
}
