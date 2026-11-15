# Generación del informe integral

El documento fuente está en `docs/entregables/Informe_Integral.md`. Sus capítulos contienen los ocho entregables y la guía de explicación. La portada deja los campos de identidad en blanco.

Desde la raíz del proyecto en Windows, con fuentes Arial y Consolas instaladas:

```powershell
python -m venv --system-site-packages .runtime/documentation/venv
.runtime/documentation/venv/Scripts/python -m pip install -r tools/documentation/requirements.txt
node --env-file=backend/.env.platform.local tools/documentation/collect_snapshot.mjs
.runtime/documentation/venv/Scripts/python tools/documentation/build_report.py
```

Se requieren dependencias instaladas de frontend/backend, el navegador Chromium de Playwright y PyMuPDF disponible. El colector consulta la base de control sin escribir datos. El generador no llama a AWS ni aprovisiona recursos; usa el inventario y los reportes existentes. Los resultados históricos no se convierten en pruebas actuales.

Salidas: `entregables/TenantForge_Informe_Integral.docx` y `entregables/TenantForge_Informe_Integral.pdf`. Son dos formatos del mismo informe. El PDF lleva el código saneado y evidencias en un ZIP adjunto; no se publica ese código automáticamente en GitHub. Algunos visores web no muestran adjuntos.

El generador valida secciones, campos sin resolver, adjunto y exclusión de archivos privados. La validación y previsualizaciones se guardan en `.runtime/documentation/`. No compartir la carpeta `.runtime` completa ni `.env.platform.local`.

Para renovar los reportes automatizados, usar el entorno local de pruebas de la aplicación. Las pruebas PostgreSQL usan un esquema temporal; las pruebas de navegador de plataforma necesitan el servidor ya iniciado y generan una solicitud de prueba que luego rechazan, sin crear VMs.

El repositorio solicitado para la entrega es `https://github.com/IngElmer10/App-IaC.git`; este procedimiento no cambia el remoto ni hace commit o push.
