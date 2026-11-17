-- =====================================================================
-- 0004 · DATOS INICIALES: clave de cifrado de PIN y consentimiento v1
-- =====================================================================

-- Clave aleatoria para cifrar los PIN de la cola de envíos. Se guarda en Supabase Vault
-- (nadie la ve en las tablas). Se crea una sola vez.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'clave_pin') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'clave_pin',
      'Clave para cifrar los PIN en la cola de envíos');
  end if;
end $$;

-- Texto de consentimiento, versión 1. {{empresa}} se reemplaza por el nombre de la empresa del colaborador.
-- El administrador general puede editarlo desde la aplicación (cada cambio crea una versión nueva).
insert into public.consentimientos (version, texto, vigente)
select 1,
$txt$Antes de iniciar, te pedimos leer y aceptar lo siguiente:

1. Quién trata tus datos. {{empresa}}, por encargo de Autonomy Consulting, recoge tus nombres, apellidos, cargo, correo electrónico y las respuestas que registres en esta evaluación.

2. Para qué se usan. Únicamente para elaborar informes de evaluación destinados a tu empresa. No se usarán para fines distintos ni se venderán o cederán a terceros ajenos a este proceso.

3. Quién puede verlos. El personal autorizado de tu empresa y de Autonomy Consulting. Ningún otro colaborador tendrá acceso a tus respuestas.

4. Cómo es la evaluación. No tiene límite de tiempo ni respuestas correctas o incorrectas. Una vez enviada, no podrás modificarla.

5. Tus derechos. Puedes solicitar el acceso o la rectificación de tus datos, y para solicitar su eliminación debes contactar al administrador de tu empresa.

Al marcar "Acepto" declaras que has leído esta información y autorizas de forma libre y voluntaria el tratamiento de tus datos para los fines indicados.$txt$,
true
where not exists (select 1 from public.consentimientos);
