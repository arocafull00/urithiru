# Visitantes del portfolio

En Vista general, seleccionar `portfolio-v3`. El panel Visitantes del porfolio consulta el registro propio consentido, independientemente de que Vercel Analytics tenga datos.

## Configuración

- `PORTFOLIO_VISITORS_SECRET`: mismo secreto dedicado que `URITHIRU_VISITORS_SECRET` en portfolio-v3.
- `PORTFOLIO_API_URL`: por defecto `https://adrianrocafulldev.es`. Solo se usa en el servidor.

`GET /api/portfolio-visitors` exige una sesión de administrador y verifica que el proyecto pertenece al equipo seleccionado y es el portfolio. Los fallos de autenticación del servicio remoto se presentan como fallo de fuente, sin cerrar la sesión local.

Los informes se validan con Zod, se paginan de seis en seis, se cachean en Zustand por usuario/equipo/proyecto/periodo/web/página y se actualizan con SWR. Cerrar sesión elimina las copias persistidas. Actualizar recarga también este panel.

No son personas identificadas: son navegadores estimados entre visitantes que aceptan. El identificador se comparte entre el dominio principal y el portfolio profesional. Los filtros y las definiciones de nuevo/recurrente están descritos en `portfolio-v3/docs/visitors.md`.

Validación del 18/11/2026: tests, TypeScript, build y lint de los archivos modificados; revisión visual local con datos ficticios en escritorio y 390 px (paginación, filtros, estado vacío y error con caché). API publicada comprobada sin sesión: 401. Informe remoto protegido y registro real probados en producción. No se ha validado visualmente el panel con una sesión de administrador en producción.
