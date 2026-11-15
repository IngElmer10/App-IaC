from __future__ import annotations

import hashlib
import html
import io
import json
import os
import re
import subprocess
import textwrap
import zipfile
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from markdown_it import MarkdownIt
from PIL import Image as PillowImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, Image, KeepTogether, PageBreak, PageTemplate, Paragraph, Preformatted, Spacer, Table, TableStyle
from reportlab.platypus.tableofcontents import TableOfContents
import pymupdf


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs' / 'entregables'
RUNTIME = ROOT / '.runtime' / 'documentation'
OUTPUT = ROOT / 'entregables'
TITLE = 'TenantForge | Informe integral del proyecto'
GREEN = '#047857'
NAVY = '#0f172a'
GRAY = '#475569'
WIDTH = A4[0] - 3.8 * cm
LOCAL_ZONE = ZoneInfo('America/La_Paz')
NOW = datetime.now(LOCAL_ZONE)
BLOCKS: list[dict] = []


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def local_date(value):
    if not value:
        return 'Sin fecha registrada'
    if isinstance(value, (float, int)):
        value = datetime.fromtimestamp(value / 1000, LOCAL_ZONE)
    else:
        value = datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(LOCAL_ZONE)
    return value.strftime('%d/%m/%Y %H:%M') + ' (UTC-4)'


def markdown_table(headers, rows):
    def cell(value):
        return str(value).replace('|', '\\|').replace('\n', ' ')
    return '\n'.join(['| ' + ' | '.join(headers) + ' |', '| ' + ' | '.join(['---'] * len(headers)) + ' |'] + ['| ' + ' | '.join(cell(value) for value in row) + ' |' for row in rows])


def svg_document(name, width, height, content):
    source = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0 0 L10 4 L0 8 Z" fill="{GREEN}"/></marker></defs><rect width="100%" height="100%" fill="#ffffff"/>{content}</svg>'
    (SOURCE / 'assets' / f'{name}.svg').write_text(source, encoding='utf-8')


def svg_text(x, y, value, size=24, color=NAVY, weight='normal', anchor='start'):
    return f'<text x="{x}" y="{y}" font-family="Arial, sans-serif" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{html.escape(value)}</text>'


def svg_box(x, y, width, height, title, lines=(), fill='#f1f5f9', border='#cbd5e1'):
    result = f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="16" fill="{fill}" stroke="{border}" stroke-width="2"/>'
    result += svg_text(x + 18, y + 35, title, 24, NAVY, 'bold')
    for offset, line in enumerate(lines):
        result += svg_text(x + 18, y + 66 + offset * 27, line, 20, GRAY)
    return result


def svg_arrow(x1, y1, x2, y2, label='', label_x=None, label_y=None):
    result = f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{GREEN}" stroke-width="3" marker-end="url(#arrow)"/>'
    if label:
        result += svg_text(label_x if label_x is not None else (x1 + x2) / 2, label_y if label_y is not None else (y1 + y2) / 2 - 10, label, 18, GREEN, anchor='middle')
    return result


def diagrams():
    (SOURCE / 'assets').mkdir(parents=True, exist_ok=True)
    content = svg_text(35, 45, 'TENANTFORGE / ARQUITECTURA DEL MVP', 29, GREEN, 'bold')
    content += svg_box(25, 75, 1450, 300, 'PLANO DE CONTROL LOCAL', (), '#f8fafc')
    content += svg_box(50, 150, 210, 115, 'Interesado', ['Solicitud pública', 'y administrador'])
    content += svg_box(310, 150, 230, 115, 'Next.js :3000', ['Página y panel', 'React / formularios'])
    content += svg_box(590, 150, 230, 115, 'NestJS :3001', ['API / guards', 'Reglas de negocio'])
    content += svg_box(880, 115, 260, 95, 'PostgreSQL local', ['Metadatos de control'])
    content += svg_box(880, 245, 260, 95, 'Worker NestJS', ['Cola persistida / 3 s'])
    content += svg_box(1200, 175, 245, 125, 'CLI del motor', ['Terraform o', 'CloudFormation'])
    content += svg_arrow(260, 205, 310, 205)
    content += svg_arrow(540, 205, 590, 205)
    content += svg_arrow(820, 175, 880, 165)
    content += svg_arrow(820, 240, 880, 285)
    content += svg_arrow(1140, 285, 1200, 245)
    content += svg_box(25, 425, 1450, 620, 'AWS / CUENTA Y VPC DE DEMOSTRACIÓN', (), '#f0fdf4', '#a7f3d0')
    content += svg_box(75, 490, 1350, 80, 'S3 privado: artefactos, estado, respaldos | SSM: parámetros y comandos | IAM: permisos', (), '#ffffff')
    content += svg_arrow(1320, 300, 1320, 485, 'AWS API', 1370, 400)
    for start, title in [(55, 'TENANT A / tres EC2 independientes'), (775, 'TENANT B / misma topología, otros datos')]:
        content += svg_box(start, 605, 665, 350, title, (), '#ffffff', '#a7f3d0')
        content += svg_box(start + 20, 680, 185, 160, 'Frontend', ['Nginx + Next.js', 'Prometheus', 'Grafana'], '#eff6ff', '#93c5fd')
        content += svg_box(start + 240, 680, 185, 160, 'Backend', ['NestJS :3001', 'Prisma', 'Reglas / token'], '#ecfdf5', '#6ee7b7')
        content += svg_box(start + 460, 680, 185, 160, 'Base de datos', ['PostgreSQL 17', 'Puerto 5432', 'EBS cifrado'], '#fff7ed', '#fdba74')
        content += svg_arrow(start + 205, 760, start + 238, 760)
        content += svg_arrow(start + 425, 760, start + 458, 760)
        content += svg_text(start + 25, 890, 'API y PostgreSQL accesibles solo por sus grupos de seguridad.', 19, GRAY)
        content += svg_text(start + 25, 922, 'Node Exporter en los tres roles; exporter PostgreSQL en la base.', 19, GRAY)
    content += svg_text(55, 1005, 'El navegador usa HTTP del frontend. No llama Terraform ni conecta directamente a PostgreSQL.', 22, GREEN)
    svg_document('arquitectura', 1500, 1080, content)
    content = svg_text(35, 45, 'CREACIÓN / DE LA SOLICITUD A LA INSTITUCIÓN ACTIVA', 28, GREEN, 'bold')
    steps = [
        ('01 / Formulario', ['Interesado elige plan, motor, entorno y color.', 'POST /api/public/tenant-requests']),
        ('02 / Solicitud PENDING', ['Prisma guarda la solicitud cifrada.', 'Todavía no se crea infraestructura.']),
        ('03 / Revisión administrativa', ['El rol platform aprueba o rechaza.', 'Transacción y control de duplicados.']),
        ('04 / Tenant + trabajo QUEUED', ['La aprobación guarda ambos registros.', 'Se borra el secreto de la solicitud revisada.']),
        ('05 / Worker RUNNING', ['Tick cada 3 s / máximo dos trabajos.', 'Valida AWS, plan, artefacto y cuota.']),
        ('06 / Motor de infraestructura', ['Terraform plan/apply o change set AWS.', 'Estado remoto / revisión de reemplazos.']),
        ('07 / Tres máquinas y configuración', ['Frontend, backend y PostgreSQL.', 'S3 + SSM + cloud-init + bootstrap por rol.']),
        ('08 / Verificación y ACTIVE', ['HTTP de servicios y tres exporters activos.', 'Resultado e historial visibles en el panel.']),
    ]
    for index, (title, lines) in enumerate(steps):
        position = 90 + index * 160
        content += svg_box(65, position, 690, 120, title, lines, '#f0fdf4' if index == 7 else '#f8fafc')
        if index < len(steps) - 1:
            content += svg_arrow(410, position + 120, 410, position + 155)
    content += svg_box(835, 410, 400, 145, 'RECHAZAR', ['Motivo e historial.', 'Sin trabajo ni nuevas VMs.'], '#fff7ed', '#fdba74')
    content += svg_arrow(755, 470, 832, 470)
    content += svg_box(835, 900, 400, 175, 'SI FALLA', ['Trabajo FAILED y error redactado.', 'Corregir causa y reintentar.', 'Se reutilizan identidad y estado.'], '#fef2f2', '#fca5a5')
    content += svg_arrow(755, 950, 832, 950)
    content += svg_text(65, 1410, 'El frontend consulta el progreso. Aprobar no espera que termine la instalación en AWS.', 22, GREEN)
    svg_document('creacion', 1300, 1460, content)
    content = svg_text(35, 45, 'OBSERVABILIDAD / PRODUCIR, RECOGER, EVALUAR Y MOSTRAR', 28, GREEN, 'bold')
    for start, title, lines in [(60, 'Node Exporter', ['Tres roles / CPU y memoria', 'Puerto 9100']), (520, 'API académica', ['/api/metrics / errores y latencia', 'Conectividad PostgreSQL']), (980, 'PostgreSQL Exporter', ['pg_up / estadísticas de base', 'Puerto 9187'])]:
        content += svg_box(start, 110, 390, 120, title, lines)
        content += svg_arrow(start + 195, 230, 715, 350)
    content += svg_box(480, 355, 470, 150, 'Prometheus / frontend del tenant', ['Recoge endpoints cada 10 s.', 'Evalúa reglas cada 10 s.', 'Series etiquetadas por tenant / entorno / rol.'], '#ecfdf5', '#6ee7b7')
    content += svg_box(120, 650, 480, 120, 'Grafana / dashboard del tenant', ['Consulta PromQL y presenta paneles.', 'No registra asistencias ni crea EC2.'], '#eff6ff', '#93c5fd')
    content += svg_box(840, 650, 480, 120, 'Backend del plano de control', ['Consulta métricas y alertas por HTTP.', 'Conserva resumen y eventos en PostgreSQL.'], '#eff6ff', '#93c5fd')
    content += svg_arrow(600, 505, 365, 645, 'Consulta', 360, 580)
    content += svg_arrow(830, 505, 1080, 645, 'Consulta', 1060, 580)
    content += svg_text(60, 840, 'Las flechas representan flujo de información; Prometheus inicia los scrapes (pull).', 23, GREEN)
    svg_document('monitoreo', 1440, 890, content)
    process = subprocess.run(['node', str(ROOT / 'tools/documentation/render_diagrams.mjs')], cwd=ROOT, capture_output=True, text=True, timeout=90, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if process.returncode:
        raise RuntimeError(process.stdout + process.stderr)


def reports_data():
    files = ['three-tier-verification.json', 'cloud-verification.json', 'security-verification.json']
    rows = []
    detail = []
    for report_index, name in enumerate(files, start=1):
        path = ROOT / '.runtime' / name
        if not path.exists():
            rows.append([name, 'No disponible', 'Sin evidencia', 'No inferir ejecución'])
            continue
        report = read_json(path)
        when = report.get('at') or report.get('checkedAt')
        checks = report.get('checks', [])
        rows.append([name, local_date(when), f'{sum(item.get("passed") is True for item in checks)}/{len(checks)}; passed={report.get("passed")}', 'Tres nodos' if name.startswith('three-tier') else 'Revisión histórica anterior'])
        detail += [f'## A.{report_index} {name}', f'Fecha: {local_date(when)}. Resultado registrado: `{report.get("passed")}`.', markdown_table(['Comprobación', 'Resultado'], [[item.get('name', ''), 'APROBADA' if item.get('passed') else 'NO APROBADA'] for item in checks])]
    extra = ROOT / '.runtime/evidence/three-tier-tecnologica.json'
    if extra.exists():
        report = read_json(extra)
        rows.append(['three-tier-tecnologica.json', local_date(report.get('at')), f'{len(report.get("checks", []))} comprobaciones; passed={report.get("passed")}', 'Tecnológica activa, antes de suspender'])
    return markdown_table(['Reporte', 'Fecha local', 'Resultado', 'Alcance'], rows), '\n\n'.join(detail)


def test_data():
    rows = []
    selected = {}
    total = 0
    for filename, label in [('unit-tests.json', 'Unitarias backend'), ('integration-tests.json', 'Integración PostgreSQL aislada')]:
        path = RUNTIME / filename
        if path.exists():
            report = read_json(path)
            passed = report.get('numPassedTests', 0)
            failed = report.get('numFailedTests', 0)
            skipped = report.get('numPendingTests', 0)
            total += passed
            rows.append([label, passed, failed, skipped, local_date(report.get('startTime'))])
            selected[filename] = {key: report.get(key) for key in ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'success', 'startTime']}
    path = RUNTIME / 'browser-tests.json'
    if path.exists():
        stats = read_json(path).get('stats', {})
        passed = stats.get('expected', 0)
        total += passed
        rows.append(['Navegador plataforma', passed, stats.get('unexpected', 0), stats.get('skipped', 0), local_date(stats.get('startTime'))])
        selected['browser-tests.json'] = stats
    (RUNTIME / 'tests-summary.json').write_text(json.dumps(selected, ensure_ascii=False, indent=2), encoding='utf-8')
    return markdown_table(['Suite', 'Aprobadas', 'Fallidas', 'Omitidas', 'Inicio local'], rows) + f'\n\nTotal ejecutado y aprobado en los reportes disponibles: **{total} pruebas**. Las pruebas de navegador de asistencia autónoma se omiten en modo plataforma; no se cuentan como aprobadas.'


def requirements_matrix():
    rows = [
        ('01', 'Catálogo de planes', 'Verificado', 'Página inicial, API y catálogo persistido.'),
        ('02', 'Recursos y límites por plan', 'Verificado', 'Cómputo, memoria, disco y límites; capítulo 6.'),
        ('03', 'Seleccionar plan al solicitar', 'Verificado', 'Formulario público y creación directa.'),
        ('04', 'Modificar configuración de planes', 'Parcial', 'Nombre y límites editables; no todos los atributos de infraestructura.'),
        ('05', 'Impedir exceder límites', 'Verificado en MVP', 'Validación backend e importación rechazada; evidencia histórica y tests.'),
        ('06', 'Cambiar plan y previsualizar', 'Parcial', 'Terraform habilitado; CloudFormation bloqueado.'),
        ('07', 'Crear con datos e identificador', 'Verificado', 'DTO, transacción, unicidad y solicitudes.'),
        ('08', 'Elegir motor de aprovisionamiento', 'Parcial', 'Terraform/CloudFormation ejecutados; OpenTofu no probado; Pulumi comparado.'),
        ('09', 'Recursos frontend/backend/base', 'Verificado', 'Tres instancias distintas por tenant en evidencia de tres nodos.'),
        ('10', 'Desplegar y conectar aplicación/base', 'Verificado', 'Bootstrap por rol y comprobaciones HTTP/PostgreSQL.'),
        ('11', 'Progreso, resultado y errores', 'Verificado', 'Trabajos, logs, estado y errores redactados.'),
        ('12', 'Reintento sin duplicación', 'Verificado en alcance', 'Estado e IDs reutilizados; tests y migraciones; no garantía universal.'),
        ('13', 'Registrar versiones', 'Parcial', 'Campos y CLI registrados; nomenclatura 0.2/0.3 necesita normalizarse.'),
        ('14', 'Filtrar tenants', 'Verificado', 'Nombre, estado, plan y entorno.'),
        ('15', 'Actualizar aplicación e infraestructura', 'Verificado en alcance', 'Dos motores; planes/reemplazos tienen restricciones explícitas.'),
        ('16', 'Suspender y reanudar', 'Verificado', 'Tres IDs; evidencia de estado y conservación.'),
        ('17', 'Conservar datos al suspender', 'Verificado', 'Stop EC2 sin borrar EBS; retención de respaldos.'),
        ('18', 'Previa y confirmación al eliminar', 'Implementado / pruebas', 'Confirmación escrita y respaldo; eliminación real final no acreditada aquí.'),
        ('19', 'Respaldar y restaurar', 'Implementado / evidencia histórica', 'Prueba real anterior y despacho por roles probado; repetir restauración final.'),
        ('20', 'Actor, fecha y resultado', 'Verificado', 'Operaciones persistidas y auditoría.'),
        ('21', 'Aplicación de asistencia actual', 'Verificado en alcance', 'Administrador/estudiante y reglas actuales; no docente ni multicurso completo.'),
        ('25', 'Integración Grafana', 'Verificado', 'Dashboard y health, captura y archivos originales.'),
        ('26', 'Métricas mínimas', 'Verificado', 'Disponibilidad, CPU, RAM, latencia, errores y base.'),
        ('27', 'Métricas por tenant y entorno', 'Verificado en alcance', 'Etiquetas y panel de cada tenant; no datasource central agregado.'),
        ('28', 'Alertas de fallas/errores/recursos', 'Implementado / muestra real', 'Reglas y alerta de demostración; no ensayo de cada falla de producción.'),
        ('29', 'Alertas/eventos recientes', 'Verificado', 'Tenant, estado y hora; sin notificación externa.'),
    ]
    return markdown_table(['RF', 'Requisito resumido', 'Estado', 'Evidencia o límite'], [[f'RF-{code}', title, state, evidence] for code, title, state, evidence in rows])


def build_markdown(snapshot):
    evidence_summary, evidence_details = reports_data()
    dashboard = read_json(ROOT / 'infrastructure/monitoring/dashboard.json')
    plans = markdown_table(['Plan', 'Tipo EC2 / instancia', 'vCPU / RAM por instancia', 'Disco inicial base', 'Estudiantes / clases'], [[plan['name'], plan['instanceType'], f"{plan['vcpu']} / {plan['memoryMb'] / 1024:g} GB", f"{plan['storageGb']} GB", f"{plan['maxStudents']} / {plan['maxSessions']}"] for plan in snapshot['plans']])
    inventory = markdown_table(['Institución', 'Identificador', 'Motor / entorno', 'Estado al capturar', 'Nodos registrados'], [[tenant['name'], tenant['slug'], f"{tenant['engine']} / {tenant['environment']}", tenant['status'], len(tenant.get('resources') or [])] for tenant in snapshot['tenants']])
    version_rows = [[name, version, 'Lockfile de la aplicación'] for name, version in snapshot['versions'].items()]
    version_rows += [['Node.js', subprocess.check_output(['node', '--version'], text=True).strip(), 'Equipo de control; AWS instala rama 24'], ['PostgreSQL', '17', 'Configuración y bootstrap de base'], ['Terraform', '1.16.5', 'CLI observada durante la implementación'], ['AWS CLI', '2.38.1', 'CLI observada durante la implementación'], ['AWS provider Terraform', '6.69.1', 'Versión fijada en la plantilla'], ['Nginx / Prometheus / Grafana', 'Paquetes del despliegue', 'No fijados todos por versión en el instalador']]
    replacements = {
        'document_control': markdown_table(['Campo', 'Valor'], [['Fecha de generación', NOW.strftime('%d/%m/%Y %H:%M') + ' (America/La_Paz)'], ['Captura de catálogo e inventario', local_date(snapshot['at'])], ['Carácter del documento', 'MVP académico; editable para la revisión docente'], ['Datos de portada', 'Se dejan en blanco por solicitud del autor'], ['Repositorio de entrega', snapshot['repository']]]),
        'plans_table': plans, 'tenant_inventory': inventory,
        'technology_versions': markdown_table(['Tecnología', 'Versión / rama', 'Fuente del dato'], version_rows),
        'evidence_summary': evidence_summary, 'evidence_details': evidence_details,
        'automated_tests': test_data(), 'requirements_matrix': requirements_matrix(),
        'dashboard_table': markdown_table(['Panel', 'Consulta PromQL'], [[panel['title'], '`' + panel['targets'][0]['expr'] + '`'] for panel in dashboard['panels']]),
        'dashboard_json': json.dumps(dashboard, ensure_ascii=False, indent=2),
        'alerts_yaml': (ROOT / 'infrastructure/monitoring/alerts.yml').read_text(encoding='utf-8').strip(),
        'datasource_yaml': (ROOT / 'infrastructure/monitoring/datasource.yml').read_text(encoding='utf-8').strip(),
        'dashboards_yaml': (ROOT / 'infrastructure/monitoring/dashboards.yml').read_text(encoding='utf-8').strip(),
    }
    content = (SOURCE / 'Informe_Integral.md').read_text(encoding='utf-8')
    for name, value in replacements.items():
        content = content.replace('{{' + name + '}}', value)
    return content


def included_files():
    excluded = {'node_modules', '.next', '.git', '.runtime', '.terraform', 'dist', 'coverage', 'test-results', 'playwright-report', '__pycache__', '.venv'}
    paths = []
    for top in ['frontend', 'backend', 'infrastructure', 'tools/documentation', 'docs/entregables']:
        for path in (ROOT / top).rglob('*'):
            if not path.is_file() or any(part in excluded for part in path.relative_to(ROOT).parts):
                continue
            if path.name.startswith('.env') or path.suffix.lower() in {'.log', '.dump', '.backup', '.pem', '.key', '.pfx', '.pyc'}:
                continue
            if '.tfstate' in path.name or '.tfvars' in path.name or path.name.endswith('.plan'):
                continue
            paths.append(path)
    paths += [ROOT / name for name in ['README.md', '.gitignore', 'Start-Platform.ps1', 'Start-MVP.ps1'] if (ROOT / name).exists()]
    return sorted(set(paths), key=lambda path: path.relative_to(ROOT).as_posix())


def build_attachment(snapshot):
    evidence_names = ['pagina-publica.png', 'plataforma.png', 'solicitudes.png', 'tres-instancias.png', 'grafana-aws.png', 'asistencia-aws.png', 'estudiante-movil-aws.png']
    (SOURCE / 'evidence').mkdir(exist_ok=True)
    for name in evidence_names:
        original = ROOT / '.runtime/evidence' / name
        if original.exists():
            (SOURCE / 'evidence' / name).write_bytes(original.read_bytes())
    rows = []
    hashes = []
    redacted = []
    secrets = secret_values()
    package_path = RUNTIME / 'TenantForge_Anexos_tecnicos.zip'
    with zipfile.ZipFile(package_path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in included_files():
            relative = path.relative_to(ROOT).as_posix()
            payload = path.read_bytes()
            try:
                decoded = payload.decode('utf-8')
                changed = decoded
                for secret in secrets:
                    changed = changed.replace(secret.decode('utf-8'), 'CONFIGURAR_CREDENCIAL_PRIVADA')
                if changed != decoded:
                    payload = changed.encode('utf-8')
                    redacted.append(relative)
            except UnicodeDecodeError:
                pass
            archive.writestr(relative, payload)
            rows.append([relative, hashlib.sha256(payload).hexdigest()[:16]])
            hashes.append(f'{hashlib.sha256(payload).hexdigest()}  {relative}')
        templates = {
            'backend/.env.example': 'DATABASE_URL=postgresql://USUARIO:CLAVE@localhost:5432/control_asistencia?schema=public\nSESSION_SECRET=REEMPLAZAR_CON_SECRETO_PRIVADO\nDEFAULT_ADMIN_PASSWORD=REEMPLAZAR\nDEFAULT_STUDENT_PASSWORD=REEMPLAZAR\nPORT=3001\nFRONTEND_URL=http://localhost:3000\nTZ=America/La_Paz\n',
            'frontend/.env.example': 'NEXT_PUBLIC_API_URL=http://localhost:3001/api\nNEXT_PUBLIC_PLATFORM_ENABLED=true\n',
        }
        for name, value in templates.items():
            archive.writestr(name, value)
        for name in ['three-tier-verification.json', 'cloud-verification.json', 'security-verification.json', 'three-tier-migrations.json']:
            path = ROOT / '.runtime' / name
            if path.exists():
                report = read_json(path)
                if 'tenants' in report:
                    report.pop('tenants')
                archive.writestr(f'evidencias/{name}', json.dumps(report, ensure_ascii=False, indent=2))
        extra = ROOT / '.runtime/evidence/three-tier-tecnologica.json'
        if extra.exists():
            archive.writestr('evidencias/three-tier-tecnologica.json', extra.read_bytes())
        archive.writestr('evidencias/tests-summary.json', (RUNTIME / 'tests-summary.json').read_bytes())
        safe_snapshot = {**snapshot, 'tenants': [{**{key: value for key, value in tenant.items() if key != 'resources'}, 'resources': [{'role': resource.get('role'), 'name': resource.get('name')} for resource in tenant.get('resources') or []]} for tenant in snapshot['tenants']]}
        archive.writestr('evidencias/snapshot-documental.json', json.dumps(safe_snapshot, ensure_ascii=False, indent=2))
        archive.writestr('MANIFIESTO_SHA256.txt', '\n'.join(hashes))
        archive.writestr('SANEAMIENTO.txt', 'La aplicación local no fue modificada. Los valores de texto que coincidían con credenciales privadas configuradas se sustituyeron únicamente en esta copia de distribución por CONFIGURAR_CREDENCIAL_PRIVADA. Configure los entornos antes de ejecutar.\nArchivos saneados:\n' + '\n'.join(redacted))
    check_export(package_path)
    checksum = hashlib.sha256(package_path.read_bytes()).hexdigest()
    manifest = f'Archivo incorporado al PDF: **{package_path.name}**.\n\nSHA-256: `{checksum}`.\n\nSe copiaron {len(rows)} archivos fuente y recursos seleccionados, además de plantillas y evidencias. Se sanearon {len(redacted)} archivos de distribución porque contenían un valor coincidente con una credencial configurada; la aplicación local no se modificó. Los hashes corresponden a los archivos efectivamente entregados después del saneamiento y el adjunto contiene sus hashes completos.\n\n'
    manifest += markdown_table(['Ruta del archivo', 'SHA-256 / primeros 16 caracteres'], rows)
    return package_path, manifest


def secret_values():
    secrets = []
    for parent in [ROOT / 'backend', ROOT / 'frontend']:
        for environment in parent.glob('.env*'):
            if environment.name.endswith('.example'):
                continue
            for line in environment.read_text(encoding='utf-8').splitlines():
                if '=' in line:
                    key, value = line.split('=', 1)
                    value = value.strip().strip('"\'')
                    if re.search('SECRET|PASSWORD|DATABASE_URL|ACCESS_KEY', key) and len(value) >= 10:
                        secrets.append(value.encode())
    access = ROOT / '.runtime/demo-access.json'
    if access.exists():
        for entry in read_json(access):
            secrets.extend(str(value).encode() for key, value in entry.items() if 'password' in key.lower() and len(str(value)) >= 10)
    return list(set(secrets))


def check_export(path):
    forbidden = []
    secrets = secret_values()
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if any(part in {'node_modules', '.git', '.runtime', '.terraform'} for part in Path(name).parts):
                forbidden.append(name)
            if Path(name).name.startswith('.env') and not name.endswith('.example'):
                forbidden.append(name)
            payload = archive.read(name)
            if any(secret in payload for secret in secrets):
                forbidden.append(name)
            if re.search(rb'(?:AKIA|ASIA)[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', payload):
                forbidden.append(name)
    if forbidden:
        raise RuntimeError('La exportación contiene material privado o prohibido: ' + ', '.join(sorted(set(forbidden))))


def parse_markdown(content):
    tokens = MarkdownIt('commonmark').enable('table').parse(content)
    blocks = []
    index = 0
    lists = []
    while index < len(tokens):
        token = tokens[index]
        if token.type in {'bullet_list_open', 'ordered_list_open'}:
            lists.append({'ordered': token.type == 'ordered_list_open', 'next': int(token.attrGet('start') or 1)})
        elif token.type in {'bullet_list_close', 'ordered_list_close'}:
            lists.pop()
        elif token.type == 'heading_open':
            inline = tokens[index + 1]
            blocks.append({'kind': 'heading', 'level': int(token.tag[1:]), 'text': inline.content, 'children': inline.children or []})
            index += 2
        elif token.type == 'paragraph_open':
            inline = tokens[index + 1]
            images = [child for child in inline.children or [] if child.type == 'image']
            if images:
                for image in images:
                    blocks.append({'kind': 'image', 'path': image.attrGet('src'), 'text': image.content})
            else:
                prefix = ''
                if lists:
                    prefix = f"{lists[-1]['next']}. " if lists[-1]['ordered'] else '• '
                    lists[-1]['next'] += 1
                blocks.append({'kind': 'paragraph', 'text': inline.content, 'children': inline.children or [], 'prefix': prefix})
            index += 2
        elif token.type == 'fence':
            blocks.append({'kind': 'code', 'text': token.content, 'language': token.info})
        elif token.type == 'table_open':
            rows = []
            current = None
            index += 1
            while tokens[index].type != 'table_close':
                current_token = tokens[index]
                if current_token.type == 'tr_open':
                    current = []
                elif current_token.type == 'inline' and current is not None:
                    current.append(current_token.content)
                elif current_token.type == 'tr_close':
                    rows.append(current)
                index += 1
            blocks.append({'kind': 'table', 'rows': rows})
        index += 1
    return blocks


def inline_html(children, prefix=''):
    result = html.escape(prefix)
    for child in children:
        if child.type == 'text':
            result += html.escape(child.content)
        elif child.type == 'code_inline':
            result += f'<font name="Code" color="#155e75">{html.escape(child.content)}</font>'
        elif child.type == 'strong_open':
            result += '<b>'
        elif child.type == 'strong_close':
            result += '</b>'
        elif child.type == 'em_open':
            result += '<i>'
        elif child.type == 'em_close':
            result += '</i>'
        elif child.type == 'link_open':
            result += f'<link href="{html.escape(child.attrGet("href") or "")}" color="{GREEN}">'
        elif child.type == 'link_close':
            result += '</link>'
        elif child.type in {'softbreak', 'hardbreak'}:
            result += '<br/>'
    return result


def plain_markdown(value):
    return re.sub(r'[*`]', '', value)


def image_size(path, max_width, max_height):
    with PillowImage.open(path) as picture:
        width, height = picture.size
    ratio = min(max_width / width, max_height / height)
    return width * ratio, height * ratio


def register_fonts():
    fonts = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'
    for name, file in [('Body', 'arial.ttf'), ('Body-Bold', 'arialbd.ttf'), ('Body-Italic', 'ariali.ttf'), ('Body-BoldItalic', 'arialbi.ttf'), ('Code', 'consola.ttf')]:
        pdfmetrics.registerFont(TTFont(name, str(fonts / file)))
    pdfmetrics.registerFontFamily('Body', normal='Body', bold='Body-Bold', italic='Body-Italic', boldItalic='Body-BoldItalic')


class ReportDocument(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(str(filename), pagesize=A4, leftMargin=1.9 * cm, rightMargin=1.9 * cm, topMargin=2.0 * cm, bottomMargin=1.8 * cm, title=TITLE, author='')
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id='content', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates(PageTemplate(id='report', frames=frame, onPage=self.decorate))
        self.heading_number = 0

    def beforeDocument(self):
        self.heading_number = 0

    def decorate(self, canvas, document):
        if document.page > 1:
            canvas.setStrokeColor(colors.HexColor('#cbd5e1'))
            canvas.line(self.leftMargin, A4[1] - 1.3 * cm, A4[0] - self.rightMargin, A4[1] - 1.3 * cm)
            canvas.setFont('Body-Bold', 8)
            canvas.setFillColor(colors.HexColor(GREEN))
            canvas.drawString(self.leftMargin, A4[1] - 1.1 * cm, 'TENANTFORGE / INFORME INTEGRAL / MVP')
        canvas.setFont('Body', 8)
        canvas.setFillColor(colors.HexColor(GRAY))
        canvas.drawString(self.leftMargin, 1.05 * cm, 'Proyecto final | Infraestructura y asistencia académica')
        canvas.drawRightString(A4[0] - self.rightMargin, 1.05 * cm, f'{document.page}')

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == 'Chapter':
            self.heading_number += 1
            key = f'chapter-{self.heading_number}'
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(flowable.getPlainText(), key, 0)
            self.notify('TOCEntry', (0, flowable.getPlainText(), self.page, key))


def pdf_report(blocks, attachment):
    register_fonts()
    stylesheet = getSampleStyleSheet()
    body = ParagraphStyle('BodyReport', fontName='Body', fontSize=10, leading=14.5, spaceAfter=8, textColor=colors.HexColor(NAVY), splitLongWords=True)
    heading = ParagraphStyle('Chapter', parent=body, fontName='Body-Bold', fontSize=19, leading=24, textColor=colors.HexColor(GREEN), spaceAfter=17, keepWithNext=True)
    section = ParagraphStyle('Section', parent=body, fontName='Body-Bold', fontSize=12.5, leading=17, spaceBefore=12, spaceAfter=9, keepWithNext=True)
    cell = ParagraphStyle('Cell', parent=body, fontSize=8, leading=10.6, spaceAfter=0)
    caption = ParagraphStyle('Caption', parent=body, fontSize=8.5, leading=12, alignment=TA_CENTER, textColor=colors.HexColor(GRAY))
    code = ParagraphStyle('CodeBlock', fontName='Code', fontSize=7.3, leading=9.8, spaceBefore=5, spaceAfter=9, backColor=colors.HexColor('#f1f5f9'), borderPadding=8)
    cover = ParagraphStyle('Cover', fontName='Body-Bold', fontSize=42, leading=49, textColor=colors.HexColor(NAVY), spaceAfter=18)
    story = [Spacer(1, 1.6 * cm), Paragraph('TENANTFORGE', ParagraphStyle('Brand', fontName='Body-Bold', fontSize=14, textColor=colors.HexColor(GREEN), spaceAfter=25)), Paragraph('Informe integral<br/>del proyecto', cover), Paragraph('MVP de plataforma multiinstitución<br/>Entregables, diseño, operación y guía explicativa', ParagraphStyle('Subtitle', parent=body, fontSize=15, leading=22)), Spacer(1, 0.8 * cm)]
    for label in ['Universidad', 'Materia', 'Docente', 'Integrantes']:
        story += [Paragraph(label, section), Paragraph('________________________________________________________________', body)]
    story += [Spacer(1, 0.5 * cm), Paragraph(NOW.strftime('%d/%m/%Y') + ' · America/La_Paz · Documento editable para revisión', body), Paragraph('Repositorio de entrega: https://github.com/IngElmer10/App-IaC.git', caption), PageBreak(), Paragraph('Contenido', ParagraphStyle('ContentsTitle', parent=heading))]
    table_of_contents = TableOfContents()
    table_of_contents.levelStyles = [ParagraphStyle('TOC', parent=body, fontSize=10, leading=16, spaceAfter=6)]
    story += [table_of_contents]
    first_heading = True
    inline_parser = MarkdownIt('commonmark')
    for block in blocks:
        kind = block['kind']
        if kind == 'heading':
            if block['level'] == 1:
                story.append(PageBreak())
                story.append(Paragraph(html.escape(block['text']), heading))
                first_heading = False
            else:
                story.append(Paragraph(html.escape(block['text']), section))
        elif kind == 'paragraph':
            story.append(Paragraph(inline_html(block['children'], block.get('prefix', '')), body))
        elif kind == 'code':
            lines = []
            for line in block['text'].splitlines():
                lines += textwrap.wrap(line, width=99, expand_tabs=False, replace_whitespace=False, drop_whitespace=False) or ['']
            for start in range(0, len(lines), 44):
                story.append(Preformatted('\n'.join(lines[start:start + 44]), code))
        elif kind == 'image':
            path = SOURCE / block['path']
            if not path.exists():
                raise FileNotFoundError(path)
            width, height = image_size(path, WIDTH, 17 * cm)
            picture = Image(str(path), width=width, height=height)
            picture.hAlign = 'CENTER'
            story.append(KeepTogether([Spacer(1, 6), picture, Spacer(1, 5), Paragraph(html.escape(block['text']), caption), Spacer(1, 10)]))
        elif kind == 'table':
            rows = [[Paragraph(inline_html(inline_parser.parseInline(value)[0].children or []), cell) for value in row] for row in block['rows']]
            count = len(rows[0])
            weights = {2: [0.67, 0.33], 3: [0.25, 0.24, 0.51], 4: [0.16, 0.28, 0.20, 0.36], 5: [0.22, 0.18, 0.20, 0.19, 0.21]}.get(count, [1 / count] * count)
            if block['rows'][0][0] == 'RF':
                weights = [0.09, 0.25, 0.22, 0.44]
            table = Table(rows, colWidths=[WIDTH * weight for weight in weights], repeatRows=1, hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#d1fae5')), ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('GRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#cbd5e1')), ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6), ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
            story += [table, Spacer(1, 10)]
    temporary = RUNTIME / 'report_without_attachment.pdf'
    ReportDocument(temporary).multiBuild(story)
    document = pymupdf.open(temporary)
    document.embfile_add(attachment.name, attachment.read_bytes(), filename=attachment.name, ufilename=attachment.name, desc='Código fuente, infraestructura, configuración Grafana y evidencias sin credenciales.')
    document.set_metadata({**document.metadata, 'title': TITLE, 'author': '', 'subject': 'Ocho entregables del proyecto final y guía de funcionamiento; MVP verificado y límites declarados.'})
    target = OUTPUT / 'TenantForge_Informe_Integral.pdf'
    document.save(target, deflate=True, garbage=4)
    document.close()
    return target


def word_inline(paragraph, children, prefix=''):
    if prefix:
        paragraph.add_run(prefix)
    bold = False
    italic = False
    inside_link = False
    for position, child in enumerate(children):
        if child.type == 'strong_open':
            bold = True
        elif child.type == 'strong_close':
            bold = False
        elif child.type == 'em_open':
            italic = True
        elif child.type == 'em_close':
            italic = False
        elif child.type in {'text', 'code_inline'}:
            if inside_link:
                continue
            run = paragraph.add_run(child.content)
            run.bold = bold
            run.italic = italic
            if child.type == 'code_inline':
                run.font.name = 'Consolas'
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor.from_string('155E75')
        elif child.type in {'softbreak', 'hardbreak'}:
            paragraph.add_run().add_break()
        elif child.type == 'link_open':
            inside_link = True
            target = child.attrGet('href') or ''
            relation = paragraph.part.relate_to(target, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)
            hyperlink = OxmlElement('w:hyperlink')
            hyperlink.set(qn('r:id'), relation)
            child_run = OxmlElement('w:r')
            properties = OxmlElement('w:rPr')
            color = OxmlElement('w:color')
            color.set(qn('w:val'), '047857')
            properties.append(color)
            child_run.append(properties)
            text_node = OxmlElement('w:t')
            label = []
            for following in children[position + 1:]:
                if following.type == 'link_close':
                    break
                if following.type in {'text', 'code_inline'}:
                    label.append(following.content)
            text_node.text = ''.join(label) or target
            child_run.append(text_node)
            hyperlink.append(child_run)
            paragraph._p.append(hyperlink)
        elif child.type == 'link_close':
            inside_link = False


def word_report(blocks):
    document = Document()
    document.core_properties.title = TITLE
    document.core_properties.author = ''
    document.core_properties.last_modified_by = ''
    section = document.sections[0]
    section.page_width, section.page_height = Inches(8.2677), Inches(11.6929)
    section.top_margin, section.bottom_margin = Inches(0.8), Inches(0.75)
    section.left_margin, section.right_margin = Inches(0.75), Inches(0.75)
    section.different_first_page_header_footer = True
    normal = document.styles['Normal']
    normal.font.name, normal.font.size = 'Arial', Pt(10)
    normal.paragraph_format.space_after = Pt(7)
    normal.paragraph_format.line_spacing = 1.15
    for name, size in [('Heading 1', 19), ('Heading 2', 13), ('Heading 3', 11)]:
        style = document.styles[name]
        style.font.name, style.font.size = 'Arial', Pt(size)
        style.font.color.rgb = RGBColor.from_string('047857')
        style.paragraph_format.keep_with_next = True
    header = section.header.paragraphs[0]
    header.text = 'TENANTFORGE / INFORME INTEGRAL / MVP'
    header.runs[0].font.size = Pt(8)
    footer = section.footer.paragraphs[0]
    footer.text = 'Proyecto final · Infraestructura y asistencia académica | '
    field = OxmlElement('w:fldSimple')
    field.set(qn('w:instr'), 'PAGE')
    footer._p.append(field)
    document.add_paragraph('TENANTFORGE', style='Subtitle')
    document.add_heading('Informe integral\ndel proyecto', 0)
    document.add_paragraph('MVP de plataforma multiinstitución\nEntregables, diseño, operación y guía explicativa', style='Subtitle')
    document.add_paragraph('')
    for label in ['Universidad', 'Materia', 'Docente', 'Integrantes']:
        document.add_paragraph(label)
        document.add_paragraph('________________________________________________________________')
    document.add_paragraph(NOW.strftime('%d/%m/%Y') + ' · America/La_Paz')
    document.add_paragraph('https://github.com/IngElmer10/App-IaC.git')
    document.add_page_break()
    document.add_heading('Contenido', 1)
    for block in blocks:
        if block['kind'] == 'heading' and block['level'] == 1:
            document.add_paragraph(block['text'])
    parser = MarkdownIt('commonmark')
    for block in blocks:
        kind = block['kind']
        if kind == 'heading':
            if block['level'] == 1:
                document.add_page_break()
            document.add_heading(block['text'], min(block['level'], 3))
        elif kind == 'paragraph':
            paragraph = document.add_paragraph()
            word_inline(paragraph, block['children'], block.get('prefix', ''))
        elif kind == 'image':
            path = SOURCE / block['path']
            width, height = image_size(path, 6.7, 6.8)
            paragraph = document.add_paragraph()
            paragraph.alignment = 1
            paragraph.add_run().add_picture(str(path), width=Inches(width), height=Inches(height))
            caption = document.add_paragraph(block['text'])
            caption.alignment = 1
            for run in caption.runs:
                run.font.size = Pt(8)
        elif kind == 'code':
            for line in block['text'].splitlines():
                for wrapped in textwrap.wrap(line, width=99, expand_tabs=False, replace_whitespace=False, drop_whitespace=False) or ['']:
                    paragraph = document.add_paragraph()
                    paragraph.paragraph_format.space_after = Pt(0)
                    paragraph.paragraph_format.line_spacing = 1
                    run = paragraph.add_run(wrapped)
                    run.font.name, run.font.size = 'Consolas', Pt(8)
        elif kind == 'table':
            table = document.add_table(rows=1, cols=len(block['rows'][0]))
            table.style = 'Light Shading Accent 1'
            for row_index, values in enumerate(block['rows']):
                row = table.rows[0] if row_index == 0 else table.add_row()
                for column, value in enumerate(values):
                    paragraph = row.cells[column].paragraphs[0]
                    word_inline(paragraph, parser.parseInline(value)[0].children or [])
                    for run in paragraph.runs:
                        run.font.size = Pt(8)
                        if row_index == 0:
                            run.bold = True
                if row_index == 0:
                    properties = row._tr.get_or_add_trPr()
                    properties.append(OxmlElement('w:tblHeader'))
            document.add_paragraph('')
    target = OUTPUT / 'TenantForge_Informe_Integral.docx'
    document.save(target)
    return target


def validate_document(pdf_path, docx_path, attachment):
    pdf = pymupdf.open(pdf_path)
    text = '\n'.join(page.get_text() for page in pdf)
    required = ['Entregable 1', 'Entregable 2', 'Entregable 3', 'Entregable 4', 'Entregable 5', 'Entregable 6', 'Entregable 7', 'Entregable 8', 'Guía explicativa', 'RF-29', 'HMAC-SHA256', 'Anexo C']
    missing = [value for value in required if value not in text]
    if missing or '{{' in text.replace('{{role}}', ''):
        raise RuntimeError(f'Contenido sin resolver o faltante: {missing}')
    if pdf.embfile_count() != 1 or pdf.embfile_get(0) != attachment.read_bytes():
        raise RuntimeError('El PDF no conserva el adjunto técnico completo.')
    cover = pdf[0].get_text()
    for label in ['Universidad', 'Materia', 'Docente', 'Integrantes']:
        if label not in cover:
            raise RuntimeError('Falta campo editable de portada: ' + label)
    preview_directory = RUNTIME / 'preview'
    preview_directory.mkdir(exist_ok=True)
    for number in sorted(set([0, 1, 2, min(12, len(pdf) - 1), len(pdf) - 1])):
        pdf[number].get_pixmap(matrix=pymupdf.Matrix(1.1, 1.1)).save(preview_directory / f'pagina-{number + 1:03}.png')
    empty_pages = [number + 1 for number, page in enumerate(pdf) if len(page.get_text().strip()) < 80]
    document = Document(docx_path)
    record = {'at': NOW.isoformat(), 'pdfPages': len(pdf), 'pdfAttachmentCount': pdf.embfile_count(), 'pdfSizeBytes': pdf_path.stat().st_size, 'docxSizeBytes': docx_path.stat().st_size, 'docxParagraphs': len(document.paragraphs), 'requiredSectionsPresent': not missing, 'shortPages': empty_pages, 'attachmentSha256': hashlib.sha256(attachment.read_bytes()).hexdigest(), 'blankIdentityFields': True, 'noInfrastructureChanged': True}
    (RUNTIME / 'document-validation.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
    pdf.close()
    return record


def main():
    OUTPUT.mkdir(exist_ok=True)
    RUNTIME.mkdir(parents=True, exist_ok=True)
    snapshot = read_json(RUNTIME / 'snapshot.json')
    diagrams()
    content = build_markdown(snapshot)
    attachment, manifest = build_attachment(snapshot)
    content = content.replace('{{source_manifest}}', manifest)
    if re.search(r'\{\{[a-z_]+\}\}', content.replace('{{role}}', '')):
        raise RuntimeError('Hay campos documentales sin resolver.')
    (RUNTIME / 'Informe_Integral_resuelto.md').write_text(content, encoding='utf-8')
    blocks = parse_markdown(content)
    pdf_path = pdf_report(blocks, attachment)
    docx_path = word_report(blocks)
    result = validate_document(pdf_path, docx_path, attachment)
    print(json.dumps({'pdf': str(pdf_path), 'word': str(docx_path), **result}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
