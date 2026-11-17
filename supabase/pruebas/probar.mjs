// Pruebas automáticas de la base de datos (Fase 6).
// Levanta un PostgreSQL real en memoria (PGlite), simula las piezas propias de Supabase
// (auth, vault, storage y los roles anon / authenticated / service_role),
// aplica las migraciones y comprueba las reglas de seguridad y de negocio.
//
// Uso:  cd supabase/pruebas  →  npm install  →  npm test
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const db = new PGlite({ extensions: { pgcrypto } })

let ok = 0
let fallos = 0
const paso = (nombre, condicion, detalle = '') => {
  if (condicion) { ok++; console.log(`  ✔ ${nombre}`) }
  else { fallos++; console.log(`  ✘ ${nombre} ${detalle}`) }
}
const q = async (sql, params) => (await db.query(sql, params)).rows
const uno = async (sql, params) => Object.values((await q(sql, params))[0] ?? {})[0]
const falla = async (sql, params) => {
  try { await db.query(sql, params); return null } catch (e) { return String(e.message) }
}
// Ejecuta como un usuario conectado (rol "authenticated" + identidad del token).
const como = async (id, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`)
  try { return await fn() } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`) }
}
const comoAnonimo = async (fn) => {
  await db.exec(`set role anon;`)
  try { return await fn() } finally { await db.exec(`reset role;`) }
}
const comoServicio = async (fn) => {
  await db.exec(`set role service_role;`)
  try { return await fn() } finally { await db.exec(`reset role;`) }
}

// ---------- Simulación mínima de Supabase ----------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema extensions; create schema vault; create schema storage;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
  create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
  create function vault.create_secret(p_secret text, p_name text, p_desc text default null) returns uuid language sql as
    $$ insert into vault.secrets (name, secret, description) values (p_name, p_secret, p_desc) returning id $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, extensions, storage to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant select on storage.objects to authenticated;
`)

console.log('\nAplicando migraciones…')
for (const f of ['0001_esquema.sql', '0002_funciones.sql', '0003_seguridad_rls.sql', '0004_datos_iniciales.sql']) {
  await db.exec(readFileSync(join(aqui, '..', 'migrations', f), 'utf8'))
  console.log(`  ✔ ${f}`)
}

const nuevoAuth = async () => uno(`insert into auth.users default values returning id`)
const consentimiento = await uno(`select id from public.consentimientos where vigente`)

// ---------- Preparación ----------
const admin = await nuevoAuth()
await q(`select public.crear_admin_general($1, 'adming', 'Admin', 'General')`, [admin])
const adminA = await nuevoAuth(); const adminB = await nuevoAuth()
const empA = await uno(`select public.crear_empresa_interno($1, $2, 'Empresa A', 'a@a.com', 'empresaa', 2)`, [adminA, admin])
const empB = await uno(`select public.crear_empresa_interno($1, $2, 'Empresa B', 'b@b.com', 'empresab', 5)`, [adminB, admin])

const crearCol = async (actor, pn, sn, pa, sa, correo) => {
  const id = await nuevoAuth()
  const r = await uno(`select public.crear_colaborador_interno($1,$2,$3,$4,$5,$6,$7,$8)`, [id, actor, pn, sn, pa, sa, 'Analista', correo])
  return { auth: id, ...r }
}

console.log('\n1. Generación de usuarios')
const a1 = await crearCol(adminA, 'Juan', 'Carlos', 'Pérez', 'Gómez', 'juan@a.com')
paso('Juan Carlos Pérez Gómez → juanp20', a1.usuario === 'juanp20', a1.usuario)
const a2 = await crearCol(adminA, 'JUAN', 'carlos', 'Perez', 'Gomez', 'juan2@a.com')
paso('Duplicado agrega sufijo → juanp201', a2.usuario === 'juanp201', a2.usuario)
const a3 = await crearCol(adminA, 'María José', null, 'Ñáñez', "O'Brien", 'maria@a.com')
paso('Tildes, ñ, espacios y símbolos → mariajosen20', a3.usuario === 'mariajosen20', a3.usuario)
const b1 = await crearCol(adminB, 'Juan', 'Carlos', 'Pérez', 'Gómez', 'juan@b.com')
paso('Unicidad global entre empresas → juanp202', b1.usuario === 'juanp202', b1.usuario)
paso('Correo repetido en la misma empresa se rechaza',
  /CORREO_DUPLICADO/.test(await falla(`select public.crear_colaborador_interno($1,$2,'Ana',null,'Paz','Ruiz',null,'JUAN@a.com')`, [await nuevoAuth(), adminA])))
paso('Un colaborador no puede crear colaboradores (actor sin rol)',
  /NO_AUTORIZADO/.test(await falla(`select public.crear_colaborador_interno($1,$2,'Ana',null,'Paz','Ruiz',null,'x@a.com')`, [await nuevoAuth(), a1.auth])))

console.log('\n2. Cuestionario (administrador general)')
let bloque1, bloque2, pPos, pNeg, pOtra
await como(admin, async () => {
  bloque1 = await uno(`select public.guardar_bloque(null, 'Comunicación', 'activo')`)
  bloque2 = await uno(`select public.guardar_bloque(null, 'Liderazgo', 'activo')`)
  pPos = await uno(`select public.guardar_pregunta(null, $1, 'Me comunico de manera clara', 'positivo', null, null, null, 'activo')`, [bloque1])
  pNeg = await uno(`select public.guardar_pregunta(null, $1, 'Interrumpo a los demás', 'negativo', 'Nunca', 'A veces', 'Siempre', 'activo')`, [bloque1])
  pOtra = await uno(`select public.guardar_pregunta(null, $1, 'Delego tareas', 'positivo', null, null, null, 'activo')`, [bloque2])
  await q(`select public.guardar_pregunta(null, $1, 'Pregunta inactiva', 'positivo', null, null, null, 'inactivo')`, [bloque2])
})
const etiquetas = (await q(`select etiqueta_izquierda i, etiqueta_centro c, etiqueta_derecha d from public.pregunta_versiones pv join public.preguntas p on p.version_actual_id = pv.id where p.id = $1`, [pPos]))[0]
paso('Etiquetas por defecto: En desacuerdo / Neutro / De acuerdo', etiquetas.i === 'En desacuerdo' && etiquetas.c === 'Neutro' && etiquetas.d === 'De acuerdo')
paso('La empresa no puede editar preguntas', /NO_AUTORIZADO/.test(await como(adminA, () => falla(`select public.guardar_pregunta(null, $1, 'Texto de prueba', 'positivo', null, null, null, 'activo')`, [bloque1]))))
paso('La empresa no puede cambiar su plan de informes', /NO_AUTORIZADO/.test(await como(adminA, () => falla(`select public.actualizar_empresa($1, 'Empresa A', 'a@a.com', 'activo', 999)`, [empA]))))

console.log('\n3. Usuario sin sesión (anónimo)')
paso('No puede leer tablas', /permission denied/.test(await comoAnonimo(() => falla(`select * from public.empresas`))))
paso('No puede ejecutar funciones', /permission denied/.test(await comoAnonimo(() => falla(`select public.panel_admin_general()`))))
paso('No puede consultar el estado de un usuario', /permission denied/.test(await comoAnonimo(() => falla(`select public.acceso_estado('juanp20')`))))

console.log('\n4. Aislamiento entre empresas')
await como(adminA, async () => {
  const lista = await uno(`select public.listar_colaboradores()`)
  paso('Empresa A lista solo sus 3 colaboradores', lista.length === 3 && lista.every((c) => c.usuario !== 'juanp202'))
  paso('Lectura directa: no ve colaboradores de B', (await uno(`select count(*)::int from public.colaboradores where empresa_id = $1`, [empB])) === 0)
  paso('Lectura directa: no ve la empresa B', (await uno(`select count(*)::int from public.empresas`)) === 1)
  paso('No puede editar un colaborador de B', /NO_ENCONTRADO/.test(await falla(`select public.actualizar_colaborador($1,'X',null,'Y','Z',null,'x@x.com')`, [b1.colaborador_id])))
  paso('No puede inactivar un colaborador de B', /NO_ENCONTRADO/.test(await falla(`select public.cambiar_estado_colaborador($1,'inactivo')`, [b1.colaborador_id])))
  paso('No puede eliminar un colaborador de B', /NO_ENCONTRADO/.test(await falla(`select public.eliminar_colaborador($1)`, [b1.colaborador_id])))
  paso('No puede cambiar roles (escritura directa bloqueada)', /permission denied/.test(await falla(`update public.perfiles set rol = 'admin_general' where id = $1`, [adminA])))
  paso('No puede insertar empresas', /permission denied/.test(await falla(`insert into public.empresas (nombre, correo) values ('Pirata', 'p@p.com')`)))
  paso('No puede leer la cola de envíos (PIN)', /permission denied/.test(await falla(`select * from public.solicitudes_envio`)))
  paso('No puede llamar funciones internas de PIN', /permission denied/.test(await falla(`select public.obtener_envios_pendientes()`)))
  paso('No puede usar el panel del administrador general', /NO_AUTORIZADO/.test(await falla(`select public.panel_admin_general()`)))
})

console.log('\n5. Solicitud de envío y PIN')
let pendientes
await comoServicio(async () => {
  const r1 = await uno(`select public.registrar_solicitud_envio($1, $2, 'abc123')`, [a1.colaborador_id, adminA])
  paso('Solicitud registrada', r1.estado === 'ok' && r1.auth_id === a1.auth)
  const r2 = await uno(`select public.registrar_solicitud_envio($1, $2, 'zzz999')`, [a1.colaborador_id, adminA])
  paso('Solicitud duplicada se ignora', r2.estado === 'ya_solicitado')
  const r3 = await uno(`select public.registrar_solicitud_envio($1, $2, 'abc123')`, [a2.colaborador_id, adminA])
  paso('PIN repetido se rechaza', r3.estado === 'pin_duplicado')
  paso('Una empresa no puede solicitar envío de otra', /NO_ENCONTRADO/.test(await falla(`select public.registrar_solicitud_envio($1, $2, 'qwe456')`, [b1.colaborador_id, adminA])))
  const elegibles = await q(`select public.colaboradores_elegibles_envio($1) id`, [adminA])
  paso('"Enviar a todos" excluye al que ya tiene solicitud', elegibles.length === 2)
  pendientes = await q(`select * from public.obtener_envios_pendientes()`)
  paso('El servicio de correo recibe usuario, correo y PIN', pendientes.length === 1 && pendientes[0].pin === 'abc123' && pendientes[0].usuario === 'juanp20' && pendientes[0].correo === 'juan@a.com')
})
const crudo = (await q(`select encode(pin_cifrado, 'escape') t from public.solicitudes_envio`))[0].t
paso('El PIN no está en texto plano en la tabla', !crudo.includes('abc123'))
paso('El historial no contiene el PIN', (await uno(`select count(*)::int from public.historial_acciones where detalle::text like '%abc123%'`)) === 0)
await comoServicio(() => q(`select public.marcar_envio($1, 'enviado')`, [pendientes[0].solicitud_id]))
paso('Al marcar "enviado" el PIN se borra de la cola', (await uno(`select count(*)::int from public.solicitudes_envio where pin_cifrado is not null`)) === 0)
paso('El colaborador queda en estado "enviado"', (await uno(`select estado_envio::text from public.colaboradores where id = $1`, [a1.colaborador_id])) === 'enviado')

console.log('\n6. Evaluación del colaborador')
await como(a1.auth, async () => {
  const antes = await uno(`select public.obtener_mi_evaluacion()`)
  paso('Empieza pendiente y con cupo', antes.estado === 'pendiente' && antes.cupo_disponible === true && antes.preguntas.length === 0)
  paso('Sin aceptar el consentimiento no inicia', /CONSENTIMIENTO_REQUERIDO/.test(await falla(`select public.iniciar_evaluacion($1)`, [admin])))
  await q(`select public.iniciar_evaluacion($1)`, [consentimiento])
  const ev = await uno(`select public.obtener_mi_evaluacion()`)
  paso('Recibe solo preguntas activas (3), agrupadas por bloque', ev.preguntas.length === 3 && ev.preguntas[0].bloque === 'Comunicación' && ev.preguntas[2].bloque === 'Liderazgo')
  paso('Cada pregunta trae exactamente tres etiquetas', ev.preguntas.every((p) => p.etiqueta_izquierda && p.etiqueta_centro && p.etiqueta_derecha))
  paso('No recibe la rúbrica ni el puntaje', ev.preguntas.every((p) => !('rubrica' in p) && !('puntaje' in p)))
  paso('Posición 4 se rechaza', /POSICION_INVALIDA/.test(await falla(`select public.guardar_respuesta($1, 4)`, [pPos])))
  await q(`select public.guardar_respuesta($1, 3)`, [pPos])
  await q(`select public.guardar_respuesta($1, 1)`, [pPos])   // cambia de opinión: sigue habiendo una sola respuesta
  await q(`select public.guardar_respuesta($1, 3)`, [pPos])
  await q(`select public.guardar_respuesta($1, 3)`, [pNeg])
  paso('Una sola respuesta por pregunta', (await uno(`select count(*)::int from public.respuestas where pregunta_id = $1`, [pPos])) === 1)
  paso('No puede finalizar con preguntas sin responder', /RESPUESTAS_INCOMPLETAS/.test(await falla(`select public.finalizar_evaluacion()`)))
  await q(`select public.guardar_respuesta($1, 2)`, [pOtra])
  paso('No puede escribir respuestas directamente', /permission denied/.test(await falla(`update public.respuestas set puntaje = 1`)))
  await q(`select public.finalizar_evaluacion()`)
  paso('Segundo envío bloqueado', /EVALUACION_NO_DISPONIBLE/.test(await falla(`select public.finalizar_evaluacion()`)))
  paso('No puede modificar respuestas después de enviar', /EVALUACION_NO_DISPONIBLE/.test(await falla(`select public.guardar_respuesta($1, 1)`, [pPos])))
  paso('Solo ve su propia ficha', (await uno(`select count(*)::int from public.colaboradores`)) === 1)
  paso('Solo ve sus propias respuestas', (await uno(`select count(*)::int from public.respuestas where colaborador_id <> $1`, [a1.colaborador_id])) === 0)
  paso('No accede al portal de empresa', /NO_AUTORIZADO/.test(await falla(`select public.listar_colaboradores()`)))
  paso('No accede al cuestionario de administración', /NO_AUTORIZADO/.test(await falla(`select public.obtener_cuestionario()`)))
  paso('No puede editar su perfil', /NO_AUTORIZADO/.test(await falla(`select public.actualizar_mi_perfil('Otro', 'Nombre')`)))
})
const punt = Object.fromEntries((await q(`select pregunta_id, posicion, puntaje from public.respuestas where colaborador_id = $1`, [a1.colaborador_id])).map((r) => [r.pregunta_id, r]))
paso('Rúbrica positiva: De acuerdo (3) = +1', punt[pPos].puntaje === 1)
paso('Rúbrica negativa: derecha (3) = −1 (signo invertido)', punt[pNeg].puntaje === -1)
paso('Neutro (2) = 0', punt[pOtra].puntaje === 0)
paso('Un colaborador no puede responder la evaluación de otro (sin evaluación en curso propia)',
  /EVALUACION_NO_DISPONIBLE/.test(await como(a3.auth, () => falla(`select public.guardar_respuesta($1, 1)`, [pPos]))))

console.log('\n7. Etiquetas históricas')
await como(admin, () => q(`select public.guardar_pregunta($1, $2, 'Interrumpo a los demás', 'negativo', 'Jamás', 'Ocasionalmente', 'Constantemente', 'activo')`, [pNeg, bloque1]))
paso('Editar una pregunta ya respondida crea la versión 2', (await uno(`select count(*)::int from public.pregunta_versiones where pregunta_id = $1`, [pNeg])) === 2)
const historica = (await como(a1.auth, () => uno(`select public.obtener_mi_evaluacion()`))).preguntas.find((p) => p.pregunta_id === pNeg)
paso('La evaluación enviada conserva sus etiquetas originales', historica.etiqueta_izquierda === 'Nunca' && historica.etiqueta_derecha === 'Siempre')

console.log('\n8. Cupo de informes')
await como(a2.auth, () => q(`select public.iniciar_evaluacion($1)`, [consentimiento]))
const sinCupo = await como(a3.auth, () => uno(`select public.obtener_mi_evaluacion()`))
paso('Con el plan agotado se informa "sin cupo"', sinCupo.cupo_disponible === false)
paso('Con el plan agotado no se puede iniciar', /SIN_CUPO/.test(await como(a3.auth, () => falla(`select public.iniciar_evaluacion($1)`, [consentimiento]))))
const panel = await como(adminA, () => uno(`select public.panel_empresa()`))
paso('Dashboard: 2 contratados, 1 utilizado, 1 disponible', panel.informes_contratados === 2 && panel.informes_utilizados === 1 && panel.informes_disponibles === 1)
paso('Dashboard: 3 colaboradores, 1 realizada, 2 pendientes', panel.total === 3 && panel.realizadas === 1 && panel.pendientes === 2)
paso('No se puede bajar el plan por debajo de lo utilizado', /PLAN_MENOR_A_UTILIZADOS/.test(await como(admin, () => falla(`select public.actualizar_empresa($1, 'Empresa A', 'a@a.com', 'activo', 0)`, [empA]))))
const general = await como(admin, () => uno(`select public.panel_admin_general()`))
paso('Admin general ve las 2 empresas con sus contadores', general.length === 2 && general.find((e) => e.nombre === 'Empresa A').total_colaboradores === 3)

console.log('\n9. Exportación e informes')
const exp = await como(adminA, () => uno(`select public.exportar_resultados()`))
paso('Excel: 1 colaborador finalizado con 3 respuestas', exp.colaboradores.length === 1 && Object.keys(exp.colaboradores[0].respuestas).length === 3)
await comoServicio(() => q(`select public.vincular_informe('juanp20', 'empresa-a/juanp20.pdf')`))
await q(`insert into storage.objects (bucket_id, name) values ('informes', 'empresa-a/juanp20.pdf')`)
paso('Empresa A puede descargar el informe vinculado', (await como(adminA, () => uno(`select count(*)::int from storage.objects`))) === 1)
paso('Empresa B no puede ver el informe de A', (await como(adminB, () => uno(`select count(*)::int from storage.objects`))) === 0)
paso('El colaborador no puede ver archivos de informes', (await como(a1.auth, () => uno(`select count(*)::int from storage.objects`))) === 0)
paso('No se vincula informe a una evaluación sin finalizar', /EVALUACION_NO_FINALIZADA/.test(await comoServicio(() => falla(`select public.vincular_informe('juanp201', 'x.pdf')`))))

console.log('\n10. Bloqueos e inactivación')
for (let i = 0; i < 5; i++) await q(`select public.acceso_registrar('juanp20', false)`)
paso('5 intentos fallidos bloquean el usuario', (await uno(`select public.acceso_estado('juanp20')`)).bloqueado === true)
await q(`select public.acceso_registrar('juanp20', true)`)
await como(adminA, () => q(`select public.eliminar_colaborador($1)`, [a3.colaborador_id]))
paso('Eliminar es lógico: el registro se conserva', (await uno(`select count(*)::int from public.colaboradores where id = $1 and eliminado_en is not null`, [a3.colaborador_id])) === 1)
paso('El colaborador eliminado pierde el acceso', (await uno(`select public.acceso_estado('mariajosen20')`)).activo === false)
paso('Su sesión abierta deja de funcionar', (await como(a3.auth, () => uno(`select public.mi_sesion()`))) === null)
await como(admin, () => q(`select public.actualizar_empresa($1, 'Empresa B', 'b@b.com', 'inactivo', 5)`, [empB]))
paso('Empresa inactiva: su administrador pierde el acceso', /NO_AUTORIZADO/.test(await como(adminB, () => falla(`select public.listar_colaboradores()`))))
paso('Empresa inactiva: sus colaboradores pierden el acceso', /NO_AUTORIZADO/.test(await como(b1.auth, () => falla(`select public.obtener_mi_evaluacion()`))))
paso('Empresa inactiva: no puede iniciar sesión', (await uno(`select public.acceso_estado('empresab')`)).activo === false)
paso('Bloque con preguntas no se puede eliminar', /BLOQUE_CON_PREGUNTAS/.test(await como(admin, () => falla(`select public.eliminar_bloque($1)`, [bloque1]))))
paso('Las acciones administrativas quedan en el historial', (await uno(`select count(*)::int from public.historial_acciones`)) > 10)

console.log(`\nResultado: ${ok} pruebas correctas, ${fallos} fallidas.\n`)
process.exit(fallos ? 1 : 0)
