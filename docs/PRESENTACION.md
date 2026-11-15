# Guion de presentación · TenantForge

## Accesos

- Página pública: http://localhost:3000; muestra descripción, planes y formulario de solicitud.
- Plataforma: http://localhost:3000/login, usuario `platform`, contraseña local inicial `platform123`.
- Instituciones: abre **Universidad Andina** o **Instituto Tecnológico** y pulsa **Abrir aplicación**.
- Las contraseñas aleatorias de los administradores de cada institución están en `.runtime/demo-access.json`, un archivo local excluido de Git. Usa el usuario `admin` con su contraseña correspondiente.
- Grafana: dentro de una institución pulsa **Grafana**; usuario `admin` y la misma contraseña inicial de esa institución.
- Estudiante para marcar en vivo: registro `1002`, con el campo `studentPassword` de su institución en `.runtime/demo-access.json`. Es diferente del campo `adminPassword`. El administrador del tenant también puede verla en su panel, en **Mostrar contraseña de estudiantes**. El registro `1001` ya fue usado en las pruebas y sirve para mostrar el historial y el aislamiento entre instituciones.

## Recorrido de 8 minutos

1. **Alcance (30 s).** Muestra la página pública y su formulario: institución, identificador, correo administrador, contraseña, teléfono, color, plan, motor y entorno. Explica que envía una solicitud, no crea recursos automáticamente.
2. **Planes (1 min).** Muestra Básico, Estándar y Avanzado: cómputo, memoria, disco, estudiantes y fechas. Abre Crear institución para mostrar contacto, identificador único, entorno, motor y selección del plan. Cancela si no quieres crear recursos adicionales.
3. **Solicitudes e infraestructura (1 min).** Abre Solicitudes para mostrar aprobación o rechazo y sus datos, sin exponer contraseñas. Abre una institución migrada: muestra las tres instancias, sus nombres con identificador y la dirección DNS de demostración. Enseña frontend, backend y PostgreSQL separados en AWS, con métricas de cada rol.
4. **Asistencia y aislamiento (1 min).** Abre ambas aplicaciones. El registro `1001` tiene un nombre distinto en cada una. Explica la prueba de API: un token de A recibe 401 al consultar B. La evidencia queda en `.runtime/cloud-verification.json` cuando finalizan las verificaciones.
5. **Ciclo de vida (1 min).** Muestra Suspender, Reanudar, Respaldar y Restaurar. Abre una confirmación de restauración para enseñar que requiere un respaldo del mismo tenant y su identificador escrito. El historial de las pruebas muestra las operaciones ya ejecutadas sin perder estudiantes.
6. **Cambio de plan (1 min).** Abre **Universidad Andina (Terraform)**, selecciona otro plan y pulsa Ver cambios. Muestra cómputo, memoria, límites y disco antes de confirmar. Explica que el disco no se reduce automáticamente. En este MVP, CloudFormation actualiza la aplicación y conserva la VM; el cambio de infraestructura de ese motor queda pendiente.
7. **Monitoreo (1 min).** Abre Grafana: disponibilidad del backend y PostgreSQL, CPU, memoria, latencia y errores. Usa Probar alerta y espera la evaluación de Prometheus; aparecerá también en Alertas de la plataforma. Usa Resolver prueba al terminar.
8. **Retención y costos (30 s).** Muestra la vista previa de Eliminar y su confirmación escrita, sin confirmar si necesitas conservar el entorno. Explica que suspender conserva el disco y que los respaldos permanecen en S3.

## Al terminar

Suspende las instituciones que ya no necesites ejecutándose. Para eliminar su infraestructura, crea primero un respaldo y utiliza la eliminación confirmada de la plataforma. El almacenamiento retenido y S3 pueden seguir generando cargos.

No presentes las plantillas de Packer o Ansible como ejecuciones realizadas: están preparadas y documentadas. OpenTofu requiere su CLI; Pulumi se incluye como comparación técnica. El acceso HTTPS y el rol docente quedan fuera de este MVP y deben explicarse como trabajo pendiente.
