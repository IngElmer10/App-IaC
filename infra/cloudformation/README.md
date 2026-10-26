# CloudFormation nested stacks + Git sync (demostracion de diplomado)

Este directorio se integra en `App-IaC/infra/cloudformation/`. Contiene:
- `legacy/template-reconstruido.yaml`: reconstruccion de capturas del ejemplo anterior. **No desplegarla** sin revisar reglas abiertas y AMI.
- `templates/main.yaml`: stack raiz inicial (una EC2 frontend).
- `templates/nested`: red, seguridad, servidor EC2 parametrizado.
- `git-sync/deployment.yaml`: configuracion exigida por CloudFormation Git sync.
- `scripts/publicar-nested.ps1`: carga templates anidados a S3 previamente.
- `scripts/validar.ps1`: valida YAML con API CloudFormation.
- `docs/cambio-companero.md`: bloque que agrega EC2 #2 durante la defensa.
- `docs/guion-10-minutos.md`: exposicion de dos integrantes.

## Requisitos

Cuenta AWS con permisos apropiados, GitHub, AWS CLI con perfil `iac`, PowerShell, bucket privado en `us-east-2` (misma region del stack), acceso AWS CodeConnections y Git sync, cuotas EC2 suficientes. Las EC2 y volumenes EBS generan costes hasta eliminarlos. No despliegues la plantilla antigua insegura.

## Preparacion previa (ANTES de la defensa)

1. En un repo local actualizado, copia esta carpeta a `infra/cloudformation/`. No borres tus otros directorios.
2. Crea un bucket S3 privado con nombre unico, en `us-east-2`. No publiques los objetos; CloudFormation debe tener acceso apropiado.
3. Desde `infra/cloudformation`:

```powershell
.\scripts\validar.ps1 -Region us-east-2 -Profile iac
.\scripts\publicar-nested.ps1 -Bucket TU_BUCKET -Region us-east-2 -Prefijo cloudformation-demo -Profile iac
```

4. Reemplaza `REEMPLAZAR_BUCKET` en `git-sync/deployment.yaml` por el nombre real del bucket.
5. Sube al repositorio, rama `main`, los archivos de esta carpeta mediante un PR, si corresponde.
6. AWS Console > CloudFormation > Create stack > **Sync from Git**. Vincula `IngElmer10/App-IaC` usando AWS CodeConnections. Selecciona la rama `main`. Indica que tienes archivo de despliegue propio en `infra/cloudformation/git-sync/deployment.yaml`; la plantilla es `infra/cloudformation/templates/main.yaml`. Selecciona/crea rol Git sync con los permisos necesarios. Completa asistente; AWS puede crear PR de inicializacion. Revisarlo y fusionarlo.
7. Espera `CREATE_COMPLETE` y verifica que existe **una** EC2 bajo el stack (puede no haber terminado user-data aunque el recurso aparezca listo).
8. Deja preparado clon de companero B y usa `docs/cambio-companero.md` para ensayar el PR con segunda EC2. Verifica `UPDATE_COMPLETE` en AWS.

## Particularidad de los nested stacks y Git sync

AWS CloudFormation Git sync observa `templates/main.yaml` y `git-sync/deployment.yaml`. Los nested stacks usan `AWS::CloudFormation::Stack` y su `TemplateURL` debe ser URL HTTPS de un objeto S3. Por ello los templates nested se publican **antes** de conectar Git sync. Un cambio a `nested/servidor.yaml` en GitHub **NO** se desplegara solo si no se vuelve a publicar a S3 y actualizar la referencia URL/version. Para la demostracion, el companero **edita main.yaml**, agrega BackendStack y reutiliza el servidor.yaml ya publicado. Esto muestra Git sync real sin pipeline adicional.

No confundir `aws cloudformation package` + `deploy` con Git sync: ambos son flujos de despliegue distintos. En este ejemplo AWS inicia updates al detectar commits integrados en la rama monitoreada.

## Seguridad y alcance

- Plantillas demo solo crean red, SG y servidores con paginas simples; **no instalan la aplicacion React/NestJS real**.
- SSH deshabilitado por defecto (`CidrSSH` vacio); puede habilitarse solo para una IP /32, HTTP 80 publico solo frontend, backend 3000 limitado al SG frontend; DB no desplegada.
- Si necesitas acceso SSH configura `CidrSSH` a tu IP real /32, añade `KeyName` valido y verifica que la cuenta tiene acceso.
- No compartas credenciales de AWS; los companeros necesitan acceso GitHub, no necesariamente AWS.
- **Nunca crear stack de demo encima de un stack de Terraform** sin analizar conflictos y coste. Utiliza stack/recursos aislados.
- Recomendado: proteger `main` con Pull Requests; espera a que termine CREATE/UPDATE_COMPLETE antes del siguiente merge.
- Al terminar, desconecta Git sync/retira configuracion, elimina el stack de prueba y elimina los artefactos S3 segun las politicas de la cuenta, evitando recursos facturables.

## Documentacion oficial

- Git sync: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/git-sync.html
- Crear stack con Git sync: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/git-sync-create-stack-from-repository-source-code.html
- Nested stacks: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-nested-stacks.html
- AMI Ubuntu via SSM: https://documentation.ubuntu.com/aws/aws-how-to/instances/build-cloudformation-templates/
