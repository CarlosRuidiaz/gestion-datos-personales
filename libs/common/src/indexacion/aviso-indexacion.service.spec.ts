import { Logger } from '@nestjs/common';
import { TipoTransaccion } from '../constantes';
import { AvisoIndexacionService } from './aviso-indexacion.service';

const URL_WEBHOOK = 'http://n8n:5678/webhook/indexar-persona';

describe('AvisoIndexacionService', () => {
  const fetchOriginal = global.fetch;
  let fetchSimulado: jest.Mock;
  let advertencias: jest.SpyInstance;

  beforeEach(() => {
    process.env.N8N_WEBHOOK_INDEXACION_URL = URL_WEBHOOK;
    fetchSimulado = jest.fn().mockResolvedValue({ ok: true, status: 202 });
    global.fetch = fetchSimulado as unknown as typeof fetch;
    advertencias = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    delete process.env.N8N_WEBHOOK_INDEXACION_URL;
    jest.restoreAllMocks();
  });

  it('envía el aviso con el contrato del webhook (documento y operación)', async () => {
    await new AvisoIndexacionService().avisar('1043123456', TipoTransaccion.CREAR);

    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const [url, opciones] = fetchSimulado.mock.calls[0];
    expect(url).toBe(URL_WEBHOOK);
    expect(opciones.method).toBe('POST');
    expect(opciones.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(opciones.body)).toEqual({ numeroDocumento: '1043123456', operacion: 'CREAR' });
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
    expect(advertencias).not.toHaveBeenCalled();
  });

  it('no falla si n8n está apagado: solo deja una advertencia', async () => {
    fetchSimulado.mockRejectedValue(new TypeError('fetch failed'));
    await expect(new AvisoIndexacionService().avisar('1043123456', TipoTransaccion.BORRAR)).resolves.toBeUndefined();
    expect(advertencias).toHaveBeenCalledWith(expect.stringContaining('n8n no recibió el aviso BORRAR de 1043123456'));
  });

  it('no falla si n8n tarda demasiado (se corta por tiempo)', async () => {
    fetchSimulado.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    await expect(new AvisoIndexacionService().avisar('1043123456', TipoTransaccion.MODIFICAR)).resolves.toBeUndefined();
    expect(advertencias).toHaveBeenCalledWith(expect.stringContaining('timeout'));
  });

  it('no falla si n8n responde con error (por ejemplo, el flujo no está publicado)', async () => {
    fetchSimulado.mockResolvedValue({ ok: false, status: 404 });
    await expect(new AvisoIndexacionService().avisar('1043123456', TipoTransaccion.CREAR)).resolves.toBeUndefined();
    expect(advertencias).toHaveBeenCalledWith(expect.stringContaining('n8n respondió 404'));
  });

  it('sin N8N_WEBHOOK_INDEXACION_URL no envía nada y lo advierte una vez al arrancar', async () => {
    delete process.env.N8N_WEBHOOK_INDEXACION_URL;
    const aviso = new AvisoIndexacionService();
    await aviso.avisar('1043123456', TipoTransaccion.CREAR);
    await aviso.avisar('1043123457', TipoTransaccion.CREAR);
    expect(fetchSimulado).not.toHaveBeenCalled();
    expect(advertencias).toHaveBeenCalledTimes(1);
  });
});
