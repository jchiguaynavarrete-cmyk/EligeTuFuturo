# Desplegar en Render

El repositorio trae `render.yaml`, así que Render crea los dos servicios
solo con leerlo.

## 1 · Crear los servicios

1. Entra a [render.com](https://render.com) y conecta tu cuenta de GitHub.
2. **New → Blueprint**.
3. Elige el repositorio `EligeTuFuturo`.
4. Render detecta `render.yaml` y propone dos servicios:
   - `eligetufuturo-app` — la aplicación
   - `eligetufuturo-backend` — el backend de pagos
5. **Apply**.

La primera construcción tarda unos minutos. Al terminar tendrás dos
direcciones, parecidas a:

```
https://eligetufuturo-app.onrender.com
https://eligetufuturo-backend.onrender.com
```

## 2 · Completar las variables del backend

Render pide cinco valores que no están en el archivo porque dependen de
tu proyecto o son secretos. En el panel del servicio **backend**, pestaña
**Environment**:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | La URL de tu proyecto Supabase |
| `SUPABASE_SECRET_KEY` | La clave secreta de Supabase |
| `FRONTEND_URL` | La dirección de la app, del paso 1 |
| `TBK_RETURN_URL` | `<dirección del backend>/api/pagos/retorno` |
| `CORS_ORIGINS` | La dirección de la app |

Guarda y el servicio se reinicia solo.

## 3 · Apuntar la app al backend

En `src/environments/environment.prod.ts`, cambia `apiPagosUrl` por la
dirección real del backend, con `/api` al final:

```ts
apiPagosUrl: 'https://eligetufuturo-backend.onrender.com/api',
```

Haz commit y push: Render reconstruye la app automáticamente.

## Lo que hay que saber del plan gratuito

**El backend se duerme tras 15 minutos sin uso.** La primera petición
después de eso tarda cerca de un minuto mientras vuelve a levantar.

Esto importa para una demostración en vivo: si el backend lleva rato
quieto, el botón de pagar parecerá colgado. **Abre la dirección del
backend unos minutos antes de presentar** para despertarlo.

La app, en cambio, es un sitio estático: carga siempre rápido y no se
duerme.

## Actualizar

Cada push a `main` reconstruye y publica las dos piezas. Las migraciones
de base de datos las aplica Supabase por su cuenta, con su propia
integración de GitHub.
