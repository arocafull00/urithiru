# Urithiru

Panel privado de Vercel con Next.js 16, React 19, TypeScript, Tailwind 4, shadcn/ui, Zustand, Clerk y Neon opcional.

## Arrancar

```powershell
pnpm install
pnpm dev --port 3018
```

Abre `http://localhost:3018`. El archivo `.env.local` de este equipo contiene claves de desarrollo de una aplicación nueva de Clerk y la conexión local a Vercel. Está excluido de Git. No se han cambiado otros proyectos ni sus ajustes de Analytics.

Para otro entorno, copia `.env.example` a `.env.local` y configura:

| Variable                                                | Uso                                                                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Aplicación Clerk propia. Las claves actuales son de desarrollo y la aplicación debe reclamarse en Clerk antes de preparar producción.                         |
| `ADMIN_EMAILS`                                          | Correos verificados autorizados, separados por comas. La instalación local autoriza al propietario de la cuenta activa de Vercel.                             |
| `ADMIN_USER_IDS`                                        | Alternativa o complemento: IDs exactos de usuarios Clerk autorizados. Sin ninguna lista configurada, se rechaza el acceso.                                    |
| `VERCEL_TOKEN`                                          | Token con acceso de lectura a tus proyectos y sus analytics/logs. Para producción crea uno específico en Vercel; la credencial local de la CLI puede caducar. |
| `VERCEL_TEAM_ID`                                        | Equipo inicial. Puedes elegir otros equipos accesibles desde el panel.                                                                                        |
| `APP_URL`                                               | URL HTTPS final; en local `http://localhost:3018`.                                                                                                            |

Las credenciales de Vercel y Neon nunca se envían al cliente. Toda API privada verifica sesión y permiso de administrador en el servidor, aunque la interfaz muestre una lectura guardada.

## Qué incluye

- Resumen de páginas vistas, visitantes por proyecto, proyectos con tráfico y fallos de despliegue/consulta.
- Evolución temporal y clasificación de proyectos por tráfico; filtros de 24 horas, 7 y 30 días, equipo y proyecto.
- Tabla buscable con favoritos, ordenación y enlaces al proyecto en Vercel.
- Detalle por páginas, fuentes, países y dispositivos.
- Lectura global de logs y filtro de errores de Vercel, Sentry y Supabase, con filtro por fuente y mensajes de cobertura parcial.
- Tema claro/oscuro, diseño adaptable y PWA instalable.
- Sesión de visualización y hasta cuatro lecturas de inicio persistidas con Zustand; actualización en segundo plano. Los proyectos sin cambios conservan sus referencias para evitar renderizados innecesarios.

Los visitantes del resumen son la **suma de los visitantes de cada proyecto**, no personas únicas entre sitios. Los cubos del gráfico se agrupan en UTC. Las fechas de los logs se muestran en la zona horaria del dispositivo. El dato de Vercel no implica que una persona esté conectada en ese instante.

## Fuentes y límites

Web Analytics usa la API pública de Vercel (`/v1/query/web-analytics/visits/aggregate`). Los proyectos con Analytics desactivado se muestran como tales; una respuesta desconocida o fallida no se sustituye por cero. La ventana consultable depende del plan. Si Vercel rechaza 30 días, el panel conserva ese error por proyecto.

Sin base de datos, los logs se leen de los despliegues actuales de producción, durante un máximo de 2,5 s por proyecto y con concurrencia limitada. Se reciben como máximo 200 eventos por proyecto y 1.000 por respuesta. **Una lectura sin logs no confirma que no existan errores anteriores.** La vista de errores señala también despliegues de producción fallidos. No es monitorización de disponibilidad ni incluye excepciones del navegador que la aplicación no envíe a Vercel.

## Sentry y Supabase

Además de Vercel, la vista de Logs/Errores puede incluir otras dos fuentes. Cada una se activa al configurar su token y se consulta en paralelo con las demás. Si una falla, aparece como aviso de cobertura parcial y el resto se sigue mostrando. Los tokens solo se usan en el servidor.

| Variable                | Uso                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `SENTRY_AUTH_TOKEN`     | Token personal (User Auth Token) con `org:read`, `project:read` y `event:read`; los Organization Tokens no sirven.                    |
| `SENTRY_ORG`            | Slug de la organización (`adrian-rocafull`).                                                                                          |
| `SENTRY_URL`            | API de la región: `https://de.sentry.io` para la UE. Por defecto, `https://sentry.io`.                                                |
| `SENTRY_PROJECTS`       | Opcional. Pares `slug-sentry:proyecto-vercel` separados por comas, p. ej. `diariamente:diariamente-web,wordle:wordle-delete-account`. |
| `SUPABASE_ACCESS_TOKEN` | Token de acceso personal de Supabase (Account → Access Tokens).                                                                       |
| `SUPABASE_PROJECTS`     | Opcional. Pares `ref-o-nombre:proyecto-vercel`, p. ej. `comunicacion-e-influencia:comunica-con-autoridad`.                            |

- **Sentry**: muestra los issues sin resolver vistos en el periodo elegido, hasta 100 por consulta, con su última aparición, número de eventos y enlace al issue. En Errores solo aparecen los de nivel `error` o `fatal`.
- **Supabase**: consulta el endpoint unificado de logs de la Management API (SQL ClickHouse) en cada proyecto activo. Recoge avisos y errores de Postgres, Auth, Storage y Edge Functions, además de las respuestas 4xx/5xx del gateway, hasta 200 por proyecto. Supabase solo permite consultar **las últimas 24 horas**, sea cual sea el periodo elegido.
- **Emparejado**: un proyecto de Sentry o Supabase se asocia al proyecto de Vercel con el mismo nombre (sin distinguir mayúsculas ni guiones) o al indicado en el mapa. Los que no se emparejan se muestran con su propio nombre y solo aparecen sin filtro de proyecto.

Con los tokens en `.env.local`, la prueba de integración `scripts/smoke.ts` (ver Validar) indica cuántos eventos llegan de cada fuente y qué proyectos no se han emparejado.

## Histórico opcional con Neon

1. Crea una base de datos Neon y configura `DATABASE_URL`.
2. Ejecuta `pnpm db:migrate`. La migración inicial está en `migrations/0001_logs.sql`; los cambios posteriores deben añadirse en nuevas migraciones.
3. En Vercel crea un Log Drain de producción, JSON o NDJSON, dirigido a `https://TU-DOMINIO/api/drains/logs`. Selecciona los proyectos que quieras conservar.
4. Configura el secreto de firma del Drain como `VERCEL_DRAIN_SECRET` en el servidor. Si Vercel pide una respuesta de verificación del destino, configura `VERCEL_DRAIN_VERIFY` con ese valor.
5. Vuelve a desplegar y comprueba la llegada de un evento real. La etiqueta «Configurado» solo indica que existen las variables, no que ya se haya recibido un evento.

La ingestión comprueba la firma HMAC-SHA1 del cuerpo original con comparación constante. Valida tamaño y estructura, admite reintentos mediante clave `(project_id, id)` e inserta el lote de forma atómica. No guarda el payload original ni campos de IP/cabeceras; los mensajes de las aplicaciones pueden contener datos propios y deben redactarse en origen. Solo se consultan registros de los proyectos accesibles en el equipo seleccionado. Se limita la consulta a los últimos 1.000 eventos; al superar ese límite conviene filtrar por proyecto. El histórico comienza al activar el Drain, sin importar registros anteriores automáticamente. La retención de Neon debe gestionarse según el volumen: no se eliminan registros automáticamente.

Sin estas variables, Urithiru funciona con la API en vivo y no necesita una base de datos. La disponibilidad y el coste de Drains dependen del plan de Vercel; no se ha activado ningún servicio de pago.

## Sesión, caché y PWA

La caché solo permite mostrar información ya consultada. Clerk y la lista de administradores siguen protegiendo cada consulta. Una sesión con respuesta 401 se cierra y limpia la caché; un 403 propio también retira los datos. Los fallos de credenciales de Vercel se tratan como errores de la fuente y no como fallos de la sesión Clerk.

Al cerrar sesión se vacían Zustand persistido, la caché de SWR y las cachés del service worker. En modo avión, la página offline permite consultar la última lectura guardada en ese navegador y borrarla. No permite verificar la sesión ni obtener información nueva. El service worker nunca almacena respuestas de API, HTML con estado de Clerk o respuestas RSC.

Para instalar usa la opción de instalación del navegador. En iPhone: Safari → Compartir → Añadir a la pantalla de inicio. Fuera de localhost se requiere HTTPS. La instalación real en iOS/Android debe comprobarse en el dispositivo.

## Validar

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Prueba de integración de lectura contra la cuenta configurada, sin imprimir claves ni mensajes de logs:

```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/smoke.ts
```

`pnpm assets` regenera iconos PNG y Open Graph. El acceso de desarrollo con Clerk, el diseño y las consultas de Vercel pueden verificarse localmente; un build correcto no prueba el despliegue, los Drains ni una instalación en móvil.

## Desplegar en Vercel

Importa este directorio como proyecto Next.js con pnpm. Reclama la aplicación Clerk y configura una instancia de producción con su dominio, claves y métodos de acceso. Copia las variables del ejemplo al entorno de producción con un token específico de Vercel y la lista de administradores. No subas `.env.local`. Comprueba que un visitante anónimo recibe 401 de `/api/dashboard` y una cuenta no autorizada recibe 403 antes de usarlo.

Es una herramienta interna: incluye `noindex`, no publica información de los proyectos en el sitemap y no necesita indexación en Search Console.

Documentación: [Vercel Web Analytics API](https://vercel.com/docs/analytics/web-analytics-api), [Runtime logs API](https://vercel.com/docs/rest-api/logs/get-logs-for-a-deployment), [Drains](https://vercel.com/docs/drains/using-drains), [seguridad de Drains](https://vercel.com/docs/drains/security), [Clerk para Next.js](https://clerk.com/docs/nextjs/getting-started/quickstart).
