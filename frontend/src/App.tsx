import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { ProveedorDeSesion } from './auth/ContextoSesion';
import type { Usuario } from './auth/sesion';
import { Marco } from './componentes/Marco';
import { RutaConRol } from './componentes/RutaConRol';
import { BorrarPersona } from './paginas/BorrarPersona';
import { Consultar } from './paginas/Consultar';
import { ConsultarLog } from './paginas/ConsultarLog';
import { CrearPersona } from './paginas/CrearPersona';
import { ImportarPersonas } from './paginas/ImportarPersonas';
import { Menu } from './paginas/Menu';
import { ModificarPersona } from './paginas/ModificarPersona';

/**
 * Rutas de la aplicación. Cada opción del menú tiene la suya y queda protegida por rol.
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
              path="crear/importar"
              element={
                <RutaConRol ruta="/crear">
                  <ImportarPersonas />
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
                  <BorrarPersona />
                </RutaConRol>
              }
            />
            <Route
              path="log"
              element={
                <RutaConRol ruta="/log">
                  <ConsultarLog />
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
