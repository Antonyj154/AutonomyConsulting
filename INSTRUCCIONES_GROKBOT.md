# Instrucciones para GrokBot — Base de datos y conexión de la plataforma de evaluaciones

Este documento es autosuficiente. Describe qué existe en el repositorio, qué debes crear en
Supabase, en qué orden, cómo verificar cada paso y qué no debes cambiar.

**Estado al entregarte el proyecto**

| Pieza | Estado |
|---|---|
| Aplicación web (`app/`) | Terminada. Funciona hoy en modo demostración (datos ficticios en el navegador). |
| Scripts SQL (`supabase/migrations/`) | Terminados y probados con 75 pruebas automáticas sobre PostgreSQL real en memoria (PGlite), simulando `auth`, `vault`, `storage` y los roles de Supabase. |
| Funciones de servidor (`supabase/functions/`) | Escritas, **no ejecutadas todavía**: no había entorno Deno ni proyecto Supabase. Debes desplegarlas y probarlas con la lista del paso 9. |
| Proyecto Supabase, GitHub, hosting | No existen aún. Los creas tú. |

---

## 1. Qué hay en el repositorio

```
app/                         Aplicación React + TypeScript + Tailwind (Vite)
  .env.example               Variables que conectan la app a Supabase
  vercel.json                Configuración de hosting (rutas y cabeceras de seguridad)
  src/lib/api/supabase.ts    Única capa que habla con Supabase
  src/lib/api/demo.ts        Modo demostración (se desactiva solo al configurar .env)
supabase/
  config.toml                Configuración de las Edge Functions
  migrations/0001_esquema.sql          Tipos, tablas, índices, triggers
  migrations/0002_funciones.sql        Toda la lógica de negocio (RPC)
  migrations/0003_seguridad_rls.sql    RLS, permisos, bucket de informes
  migrations/0004_datos_iniciales.sql  Clave de cifrado de PIN + consentimiento v1
  functions/iniciar-sesion/  Login con usuario + clave y bloqueo por intentos
  functions/empresas/        Crear empresa / restablecer contraseña (admin general)
  functions/colaboradores/   Crear colaboradores, individual y masivo (empresa)
  functions/envios/          Generar PIN y encolar envío (empresa)
  functions/_shared/comun.ts Utilidades comunes
  pruebas/probar.mjs         Pruebas automáticas de la base
```

## 2. Modelo de seguridad (léelo antes de tocar nada)

1. **El navegador no escribe directo en ninguna tabla.** `authenticated` solo tiene `SELECT`
   (filtrado por RLS) y `EXECUTE` sobre una lista cerrada de funciones. No existen políticas de
   `INSERT/UPDATE/DELETE`. No las agregues.
2. **El rol y la empresa salen siempre de la tabla `perfiles`**, nunca de lo que envía el navegador
   ni de los metadatos del token. Las funciones `auth_rol()`, `auth_empresa_id()` y
   `auth_colaborador_id()` devuelven `null` si la cuenta o su empresa están inactivas, así que una
   sesión abierta pierde el acceso al instante.
3. **Acceso por usuario, no por correo.** Cada cuenta de Supabase Auth se crea con un correo interno
   aleatorio (`<uuid>@acceso.invalid`) que nadie conoce. El login pasa obligatoriamente por la Edge
   Function `iniciar-sesion`, que busca el usuario, aplica el bloqueo (5 fallos → 15 minutos) y
   responde siempre el mismo error para no revelar si el usuario existe.
4. **Administradores usan contraseña (mínimo 10 caracteres). Colaboradores usan un PIN** de 6
   caracteres `[a-z0-9]`, generado con azar criptográfico al pulsar "Enviar evaluación". El PIN se
   guarda: (a) cifrado por Supabase Auth como credencial; (b) cifrado con `pgcrypto` en
   `solicitudes_envio.pin_cifrado` solo hasta que el servicio de correo confirma el envío; (c) como
   huella HMAC en `colaborador_pin` para garantizar que no se repita. Nunca en texto plano, nunca en
   el historial, nunca en una respuesta al navegador.
5. **La llave `service_role` solo vive en las Edge Functions y en las herramientas de servidor**
   (correo e informes). Jamás en `app/`, en `VITE_*` ni en el repositorio.

## 3. Crear y configurar el proyecto Supabase

1. Crea un proyecto nuevo y vacío. Anota: URL del proyecto, llave pública (anon / publishable) y
   llave de servicio (service_role / secret).
2. **Authentication → Sign In / Providers**
   - Proveedor Email: activado (es el que permite usuario + contraseña).
   - *Allow new users to sign up*: **desactivado**. No debe existir registro público.
   - *Confirm email*: indiferente (las cuentas se crean ya confirmadas desde el servidor).
3. **Authentication → Password policy**
   - Longitud mínima: **6**. Sin requisitos de mayúsculas, dígitos o símbolos.
     (El PIN tiene 6 caracteres en minúsculas y números; una política más estricta haría fallar
     "Enviar evaluación". La regla de 10 caracteres para administradores la aplican la app y las
     Edge Functions.)
   - Protección contra contraseñas filtradas: desactivada (puede rechazar un PIN al azar).
4. **Database → Extensions**: confirma que `pgcrypto` y `supabase_vault` están disponibles
   (vienen por defecto). La migración 0001 instala `pgcrypto` en el esquema `extensions`.

## 4. Ejecutar las migraciones

Ejecuta los cuatro archivos **en orden y una sola vez**, en el SQL Editor (pega cada archivo
completo) o con la CLI:

```
0001_esquema.sql → 0002_funciones.sql → 0003_seguridad_rls.sql → 0004_datos_iniciales.sql
```

No son idempotentes (salvo 0004). Si alguno falla a la mitad, no lo reintentes encima: corrige la
causa, borra el esquema creado y vuelve a empezar. **No ejecutes nada destructivo sobre un proyecto
que ya tenga datos reales sin autorización del propietario.**

### Verificación (todas deben cumplirse)

```sql
-- 13 tablas, todas con RLS activado
select count(*) filter (where rowsecurity) as con_rls, count(*) as total
from pg_tables where schemaname = 'public';                        -- esperado: 13 | 13

-- 10 políticas de lectura en public y 1 en storage
select schemaname, count(*) from pg_policies
where schemaname in ('public', 'storage') and (schemaname = 'public' or policyname = 'informes_descarga')
group by 1;                                                        -- public 10 | storage 1

-- Ninguna política de escritura
select count(*) from pg_policies where schemaname = 'public' and cmd <> 'SELECT';   -- 0

-- anon no puede ejecutar ninguna función ni leer ninguna tabla
select count(*) from information_schema.routine_privileges
where routine_schema = 'public' and grantee = 'anon';              -- 0
select count(*) from information_schema.table_privileges
where table_schema = 'public' and grantee = 'anon';                -- 0

-- Clave de cifrado creada, consentimiento v1 y bucket privado
select count(*) from vault.secrets where name = 'clave_pin';       -- 1
select version, vigente from public.consentimientos;               -- 1 | true
select id, public from storage.buckets where id = 'informes';      -- informes | false
```

## 5. Crear al administrador general (una sola vez)

1. Dashboard → Authentication → Users → **Add user**. Correo: cualquier dirección interna única, por
   ejemplo `admin-interno@acceso.invalid` (no se usa para ingresar). Contraseña: la que defina el
   propietario, mínimo 10 caracteres. Marca *Auto Confirm User*.
2. Copia el `User UID` y ejecuta en el SQL Editor:

```sql
select public.crear_admin_general('<USER_UID>', 'admin', 'Nombre', 'Apellido');
```

El segundo parámetro es el usuario con el que ingresará (4 a 30 caracteres, solo `a-z0-9`).
La contraseña no debe quedar escrita en ningún archivo, ticket ni registro.

## 6. Desplegar las Edge Functions

```
supabase link --project-ref <ref>
supabase functions deploy iniciar-sesion empresas colaboradores envios
```

- `supabase/config.toml` fija `verify_jwt = false` en las cuatro. No es un descuido: cada función
  valida el token por sí misma (`identificar` + `tieneRol`), lo que funciona tanto con las llaves
  antiguas como con las nuevas. `iniciar-sesion` es la única que se llama sin sesión.
- Variables: Supabase inyecta `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.
  Si el proyecto no las inyecta, define los secretos `CLAVE_PUBLICA` y `CLAVE_SERVICIO`.
- Restringe el origen permitido al dominio real de la app:

```
supabase secrets set ORIGENES_PERMITIDOS=https://<dominio-de-la-app>
```

  (Varios dominios separados por coma. Si no se define, se acepta cualquier origen: aceptable solo
  durante pruebas.)

## 7. Conectar la aplicación

1. En `app/`, copia `.env.example` como `.env.local` y completa:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<llave pública>
```

   Con esas dos variables la app deja el modo demostración automáticamente (desaparece la franja
   oscura superior y los accesos de demostración).
2. Prueba local: `npm install` y `npm run dev` dentro de `app/`.
3. Hosting (recomendado Vercel): directorio raíz `app`, comando `npm run build`, salida `dist`.
   Define las mismas dos variables en el panel del hosting. `app/vercel.json` ya incluye la
   reescritura de rutas y las cabeceras de seguridad.
4. GitHub: sube el repositorio completo. `.gitignore` ya excluye `.env*` y `node_modules`.
   Antes del primer `push`, confirma que no hay ninguna llave en el historial.

## 8. Contratos para los servicios externos (etapa posterior)

Ambos servicios usan la llave **service_role** desde un servidor. Nunca desde un navegador.

### 8.1 Servicio de correo (envío de usuario + PIN)

La aplicación solo cambia el estado a `solicitado`. El servicio de correo hace el resto:

```
1) Leer pendientes
   POST {SUPABASE_URL}/rest/v1/rpc/obtener_envios_pendientes
   Cabeceras: apikey: <service_role>, Authorization: Bearer <service_role>, Content-Type: application/json
   Cuerpo: {}
   Respuesta: [{ solicitud_id, usuario, pin, correo, nombre_completo, empresa, solicitado_en }]

2) Enviar el correo a "correo" con "usuario" y "pin".

3) Informar el resultado de cada uno
   POST {SUPABASE_URL}/rest/v1/rpc/marcar_envio
   Cuerpo: { "p_solicitud_id": "<solicitud_id>", "p_estado": "enviado" }
        o  { "p_solicitud_id": "<solicitud_id>", "p_estado": "error", "p_detalle": "motivo breve" }
```

- Al marcar `enviado` o `error`, el PIN cifrado se borra de la cola. Si hubo error, la empresa
  vuelve a pulsar "Enviar evaluación" y se genera un PIN nuevo.
- El servicio no debe guardar ni registrar el PIN en sus propios logs.
- Estados visibles para la empresa: Sin enviar → Solicitado → Enviado / Error de envío.

### 8.2 Generador de informes (PDF por colaborador)

```
1) Subir el archivo al bucket privado "informes" (Storage), por ejemplo en la ruta
   <empresa_id>/<usuario>.pdf

2) Vincularlo al colaborador
   POST {SUPABASE_URL}/rest/v1/rpc/vincular_informe
   Cuerpo: { "p_usuario": "juanp20", "p_ruta": "<empresa_id>/juanp20.pdf" }
```

- Solo se puede vincular a una evaluación finalizada. Desde ese momento la empresa ve activo el
  botón "Descargar informe", que abre un enlace firmado válido 60 segundos.
- Los datos para generar el informe están en `respuestas` (posición 1-3 y puntaje −1/0/1),
  `pregunta_versiones` (texto, rúbrica y etiquetas exactas que vio el colaborador) y `evaluaciones`.

## 9. Pruebas

### 9.1 Pruebas automáticas de la base (ya pasan: 75 de 75)

```
cd supabase/pruebas
npm install
npm test
```

Vuelve a ejecutarlas si modificas cualquier archivo SQL. Cubren: generación de usuarios, aislamiento
entre empresas, bloqueo de escrituras directas y de cambio de rol, PIN (cifrado, duplicados, borrado),
puntajes y rúbrica, etiquetas históricas, cupo de informes, exportación, informes en Storage,
bloqueo por intentos e inactivación.

### 9.2 Pruebas de extremo a extremo tras conectar Supabase (pendientes: hazlas tú)

Las Edge Functions no se han ejecutado nunca. Verifica y reporta cada punto:

1. Ingresar como administrador general con usuario + contraseña → llega a `/admin`.
2. Cinco contraseñas erróneas seguidas → mensaje de bloqueo de 15 minutos. Un usuario inexistente
   devuelve el mismo mensaje que una clave errónea.
3. Crear una empresa (usuario + contraseña + plan). Ingresar con esa cuenta → llega a `/empresa`.
4. Crear un colaborador "Juan Carlos Pérez Gómez" → usuario `juanp20`. Crear otro igual con otro
   correo → `juanp201`.
5. Carga masiva con la plantilla (incluye una fila con correo inválido y una repetida) → crea las
   válidas y lista las omitidas.
6. "Enviar evaluación" → estado `Solicitado`. `obtener_envios_pendientes` devuelve usuario y PIN.
   `marcar_envio(..., 'enviado')` → estado `Enviado` y `pin_cifrado` queda en `null`.
7. Ingresar como el colaborador con usuario + PIN → `/mi`. Aceptar consentimiento, responder, enviar.
   Un segundo envío debe fallar.
8. Con el plan en 0 disponibles, otro colaborador no puede iniciar.
9. "Descargar resultados" genera el Excel con las hojas Resultados, Detalle y Preguntas.
10. Con la llave pública y sin sesión, `GET /rest/v1/colaboradores` y cualquier `rpc` deben
    responder error de permisos. Con la sesión de la empresa A no debe aparecer ningún dato de B.
11. Revisar los logs de las funciones: no debe aparecer ningún PIN ni contraseña.

## 10. Lo que no debes cambiar sin consultar al propietario

- No agregar políticas de escritura ni dar `EXECUTE` a `anon`.
- No exponer al navegador las funciones internas (`crear_*_interno`, `registrar_solicitud_envio`,
  `obtener_envios_pendientes`, `marcar_envio`, `vincular_informe`, `acceso_*`).
- No activar el registro público ni el inicio de sesión por enlace mágico u OAuth.
- No guardar PIN o contraseñas en tablas, logs, URLs o mensajes de error.
- No cambiar la regla del usuario (primer nombre + inicial del primer apellido + total de letras de
  todos los nombres y apellidos; sufijo 1, 2, 3… si ya existe) ni permitir que cambie al editar.
- No convertir la eliminación de colaboradores, preguntas o bloques con historial en borrado físico.

## 11. Reglas de negocio acordadas con el propietario

- Un solo cuestionario para toda la plataforma, administrado por el administrador general.
- Cada pregunta tiene exactamente tres opciones (izquierda, centro, derecha) con textos editables.
  Se guarda la posición (1, 2, 3) y el puntaje (−1, 0, 1); con rúbrica negativa se invierte el signo.
- Todas las preguntas activas son obligatorias. Una evaluación por colaborador, sin segundo envío.
- Cada evaluación finalizada consume un informe del plan. Disponibles = contratados − finalizadas.
  Una evaluación iniciada reserva cupo: si iniciadas + finalizadas ≥ contratados, nadie más inicia.
- El colaborador no edita su perfil; lo hace su empresa. No existe "recuperar contraseña": la
  empresa reenvía (PIN nuevo) y el administrador general restablece la contraseña de una empresa.
- "Enviar a todos" incluye solo colaboradores activos sin evaluación finalizada y sin envío en curso.
- La empresa no ve respuestas en pantalla; las obtiene en el Excel de resultados y en el informe PDF.
- El colaborador acepta un consentimiento versionado antes de iniciar; queda registrado cuál aceptó.
