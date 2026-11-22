import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { ProveedorDeSesion } from './auth/ContextoSesion';
import type { Usuario } from './auth/sesion';
import { Marco } from './componentes/Marco';
import { RutaConRol } from './componentes/RutaConRol';
import { Consultar } from './paginas/Consultar';
import { CrearPersona } from './paginas/CrearPersona';
import { EnConstruccion } from './paginas/EnConstruccion';
import { Menu } from './paginas/Menu';
import { ModificarPersona } from './paginas/ModificarPersona';

/**
 * Rutas de la aplicación. Cada opción del menú tiene la suya y queda protegida por rol.
 * Crear y modificar son de T12; T13 reemplaza las páginas de consultar, borrar y log.
 */
export function App({ usuario }: { usuario: Usuario }) {
  return (
    <ProveedorDeSesion usuario={usuario}>
      <BrowserRouter>
        <Routes>
          <Route element={<Marco />}>
            <Route index element={<Menu />} />
            <Route
              path="crear"
              element={
                <RutaConRol ruta="/crear">
                  <CrearPersona />
                </RutaConRol>
              }
            />
            <Route
              path="modificar"
              element={
                <RutaConRol ruta="/modificar">
                  <ModificarPersona />
                </RutaConRol>
              }
            />
            <Route
              path="consultar"
              element={
                <RutaConRol ruta="/consultar">
                  <Consultar />
                </RutaConRol>
              }
            />
            <Route
              path="borrar"
              element={
                <RutaConRol ruta="/borrar">
                  <EnConstruccion titulo="Borrar personas" tarea="T13" />
                </RutaConRol>
              }
            />
            <Route
              path="log"
              element={
                <RutaConRol ruta="/log">
                  <EnConstruccion titulo="Consultar log" tarea="T13" />
                </RutaConRol>
              }
            />
            <Route path="*" element={<NoEncontrada />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ProveedorDeSesion>
  );
}

function NoEncontrada() {
  return (
    <section className="aviso">
      <h1>Esta página no existe</h1>
      <Link to="/" className="boton">
        Volver al menú
      </Link>
    </section>
  );
}
