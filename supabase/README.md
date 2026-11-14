# Base de datos

El esquema vive en `migrations/`, como archivos SQL numerados por fecha.

## Cómo se aplican

El repositorio está conectado a Supabase con la integración de GitHub.
Al hacer push a `main`, Supabase ejecuta las migraciones que todavía no
haya aplicado, en orden de nombre.

No hay que pegar SQL a mano en el editor: basta con agregar un archivo
nuevo y subirlo.

## Cómo agregar un cambio

Crea un archivo en `migrations/` con el formato `AAAAMMDDHHMMSS_nombre.sql`.
Por ejemplo:

    20261120093000_agrega_columna_telefono.sql

El nombre define el orden, así que la fecha debe ser posterior a la de
las migraciones ya aplicadas.

**Las migraciones no se editan después de aplicadas.** Supabase lleva
registro de cuáles ya corrió y no vuelve a ejecutarlas; si cambias una
vieja, el cambio no se aplica en ningún lado. Para corregir algo, se
agrega una migración nueva.

## Migraciones actuales

| Archivo | Qué hace |
|---|---|
| `20261114000001_esquema.sql` | Las ocho tablas, sus índices y el disparador que crea el perfil al registrarse |
| `20261114000002_seguridad.sql` | Activa RLS y define las políticas de acceso |

Ambas se aplicaron a mano en el editor de Supabase antes de conectar la
integración. Están escritas con `if not exists` y `create or replace`, así
que volver a ejecutarlas no rompe nada.

## Branching

La creación automática de bases de prueba por cada Pull Request requiere
el plan Pro. En el plan gratuito solo se despliega desde `main`, que es
lo que está configurado.
