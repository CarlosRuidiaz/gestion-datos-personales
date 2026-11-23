// Servidor de prueba que hace las veces del webhook de n8n en services/verificar-indexacion.sh.
// Escribe en su salida una línea JSON por cada aviso recibido y responde 202.
// POST /lento con un número de milisegundos hace que tarde ese tiempo en responder.
const http = require("http");
let demora = 0;
http
  .createServer((peticion, respuesta) => {
    let cuerpo = "";
    peticion.on("data", (parte) => (cuerpo += parte));
    peticion.on("end", () => {
      if (peticion.url === "/lento") {
        demora = Number(cuerpo) || 0;
        respuesta.end("ok");
        return;
      }
      console.log(JSON.stringify({ metodo: peticion.method, ruta: peticion.url, tipo: peticion.headers["content-type"], cuerpo }));
      setTimeout(() => {
        respuesta.writeHead(202, { "content-type": "application/json" });
        respuesta.end('{"mensaje":"Indexación en curso"}');
      }, demora);
    });
  })
  .listen(8080);
