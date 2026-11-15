"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { actionLabels, statusLabels, platformRequest, tenantSchema, type Overview, type Tenant, type TenantValues, type Operation } from "../../lib/platform";

import { RequestsInbox } from "../../components/platform/requests-inbox";
import { TenantInventory } from "../../components/platform/tenant-inventory";

const empty: Overview = { tenants: [], plans: [], operations: [], alerts: [], region: "us-east-1", cloudConfigured: false, pendingRequests: 0 };
const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600";
const buttonClass = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const dateText = (date: string) => new Date(date).toLocaleString("es-BO", { timeZone: "America/La_Paz", dateStyle: "short", timeStyle: "short" });

function Badge({ state }: { state: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${["ACTIVE", "SUCCEEDED", "RESOLVED"].includes(state) ? "bg-emerald-50 text-emerald-800" : ["FAILED", "FIRING"].includes(state) ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>{statusLabels[state] || state}</span>;
}

export default function PlatformPage() {
  const [overview, setOverview] = useState(empty);
  const [tab, setTab] = useState("tenants");
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [environment, setEnvironment] = useState("");
  const [state, setState] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [targetPlan, setTargetPlan] = useState("");
  const [preview, setPreview] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [backupId, setBackupId] = useState("");
  const [acting, setActing] = useState(false);
  const [expandedLog, setExpandedLog] = useState("");
  const selectedId = selected?.id;
  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<TenantValues>({ resolver: zodResolver(tenantSchema), defaultValues: { name: "", slug: "", contactEmail: "", environment: "dev", engine: "terraform", planId: "", adminPassword: "", color: "#059669", contactPhone: "" } });
  const selectedPlan = useWatch({ control, name: "planId" });

  const reload = useCallback(async () => {
    const data = await platformRequest<Overview>("overview");
    setOverview(data);
    if (selectedId) {
      const refreshed = await platformRequest<Tenant>(`tenants/${selectedId}`);
      setSelected((current) => current?.id === selectedId ? refreshed : current);
    }
    setLoading(false);
  }, [selectedId]);

  useEffect(() => {
    void Promise.resolve().then(reload).catch((requestError: Error) => { setError(requestError.message); setLoading(false); });
    const timer = setInterval(() => { void reload().catch(() => setError("La actualización automática perdió conexión. Reintenta en unos segundos.")); }, 5000);
    return () => clearInterval(timer);
  }, [reload]);

  const createTenant = async (values: TenantValues) => {
    setError("");
    try {
      const tenant = await platformRequest<Tenant>("tenants", { method: "POST", body: JSON.stringify({ ...values, contactPhone: values.contactPhone || undefined }) });
      setCreating(false);
      reset();
      setSelected(await platformRequest<Tenant>(`tenants/${tenant.id}`));
      setNotice("Institución creada. El despliegue real quedó en cola; puedes seguir su progreso aquí.");
      await reload();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "No se pudo crear la institución."); }
  };

  const runAction = async (action: string) => {
    if (!selected) return;
    setActing(true);
    setError("");
    try {
      await platformRequest(`tenants/${selected.id}/actions`, { method: "POST", body: JSON.stringify({ action, ...(action === "CHANGE_PLAN" ? { planId: targetPlan } : {}), ...(action === "RESTORE" ? { backupId } : {}), ...(["DELETE", "RESTORE", "MIGRATE"].includes(action) ? { confirmation } : {}) }) });
      setConfirmAction("");
      setConfirmation("");
      setNotice(`${actionLabels[action]}: operación registrada. El historial se actualizará automáticamente.`);
      await reload();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "No se pudo registrar la operación."); }
    finally { setActing(false); }
  };

  const showPreview = async (action: string) => {
    if (!selected) return;
    if (action === "MIGRATE") { setPreview(["Se crearán instancias dedicadas para backend y base de datos; la instancia actual pasará a ser frontend.", "Se respaldarán y verificarán los datos antes del cambio. Habrá una pausa de escritura.", "El tenant tendrá tres instancias facturables."]); setConfirmAction(action); return; }
    try {
      const result = await platformRequest<{ changes: string[] }>(`tenants/${selected.id}/preview${action === "CHANGE_PLAN" ? `?planId=${encodeURIComponent(targetPlan)}` : ""}`);
      setPreview(result.changes);
      setConfirmAction(action);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "No se pudo obtener la vista previa."); }
  };

  const retry = async (operation: Operation) => {
    try { await platformRequest(`operations/${operation.id}/retry`, { method: "POST" }); setNotice("Reintento en cola. Se reutilizará el estado existente."); await reload(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "No se pudo reintentar."); }
  };

  const tenants = overview.tenants.filter((tenant) => (!search || `${tenant.name} ${tenant.slug}`.toLowerCase().includes(search.toLowerCase())) && (!environment || tenant.environment === environment) && (!state || tenant.status === state) && (!planFilter || tenant.plan.id === planFilter));
  const operations = selected?.operations || overview.operations;
  const busy = Boolean(selected?.operations?.some((operation) => ["QUEUED", "RUNNING"].includes(operation.state)));

  return (
    <main className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Control de infraestructura · AWS {overview.region}</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{selected ? selected.name : "Plataforma de instituciones"}</h1><p className="mt-2 text-sm text-slate-500">{selected ? `${selected.slug} · ${selected.environment} · ${selected.engine}` : "Planes, despliegues y operación de tus espacios académicos."}</p></div>
        {selected ? <button className={buttonClass} onClick={() => setSelected(null)}>← Todas las instituciones</button> : <button className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700" onClick={() => { setCreating(true); reset({ environment: "dev", engine: "terraform", planId: overview.plans[0]?.id || "", color: "#059669" }); }}>+ Crear institución</button>}
      </header>

      {error ? <div role="alert" className="flex justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button onClick={() => setError("")} aria-label="Cerrar error">×</button></div> : null}
      {notice ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p> : null}
      {!overview.cloudConfigured && !loading ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Falta publicar el paquete de despliegue y configurar los buckets AWS. Las operaciones mostrarán el error real hasta completar esa configuración.</p> : null}

      {!selected ? <>
        <section className="grid gap-4 sm:grid-cols-4">
          {[['Instituciones', overview.tenants.length], ['Activas', overview.tenants.filter((tenant) => tenant.status === 'ACTIVE').length], ['Operaciones en curso', overview.operations.filter((operation) => ['QUEUED', 'RUNNING'].includes(operation.state)).length], ['Alertas activas', overview.alerts.length]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold text-slate-900">{value}</p></div>)}
        </section>
        <nav aria-label="Secciones de plataforma" className="flex gap-1 overflow-x-auto border-b border-slate-200">{[['tenants','Instituciones'],['requests',`Solicitudes (${overview.pendingRequests || 0})`],['plans','Planes'],['operations','Operaciones'],['alerts','Alertas']].map(([key,label]) => <button key={key} onClick={() => setTab(key)} className={`border-b-2 px-5 py-3 text-sm font-semibold ${tab === key ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500'}`}>{label}</button>)}</nav>
        {tab === "requests" ? <RequestsInbox onReviewed={reload}/> : null}
        {tab === "tenants" ? <>
          <div className="grid gap-3 sm:grid-cols-4"><input aria-label="Buscar institución" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar institución..." className={inputClass}/><select aria-label="Filtrar por estado" className={inputClass} value={state} onChange={(event) => setState(event.target.value)}><option value="">Todos los estados</option>{['PENDING','PROVISIONING','ACTIVE','SUSPENDED','FAILED'].map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select><select aria-label="Filtrar por entorno" className={inputClass} value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="">Todos los entornos</option>{['dev','staging','prod'].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filtrar por plan" className={inputClass} value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}><option value="">Todos los planes</option>{overview.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></div>
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{tenants.map((tenant) => <button key={tenant.id} onClick={async () => { try { setSelected(await platformRequest<Tenant>(`tenants/${tenant.id}`)); } catch { setError('No se pudo cargar la institución.'); } }} style={{ borderTop: `4px solid ${tenant.color || "#059669"}` }} className="rounded-2xl border border-slate-200 bg-white p-6 text-left transition hover:border-emerald-500 hover:shadow-md"><div className="flex items-center justify-between gap-3"><span style={{ backgroundColor: `${tenant.color || "#059669"}18`, color: tenant.color || "#059669" }} className="grid size-11 place-items-center rounded-xl text-xl font-bold">{tenant.name.slice(0,2).toUpperCase()}</span><Badge state={tenant.status}/></div><h2 className="mt-5 text-lg font-bold text-slate-900">{tenant.name}</h2><p className="mt-1 text-sm text-slate-500">{tenant.slug} · {tenant.environment} · {tenant.architectureVersion >= 2 ? '3 instancias' : 'Arquitectura anterior'}</p><div className="mt-5 flex justify-between border-t border-slate-100 pt-4 text-xs text-slate-500"><span>{tenant.plan.name} · {tenant.engine}</span><span>{tenant.health?.available ? '● Servicios disponibles' : tenant.status === 'ACTIVE' ? 'Salud por verificar' : 'Ver detalles →'}</span></div></button>)}</section>
          {!tenants.length ? <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-slate-500">{loading ? 'Cargando plataforma...' : 'No hay instituciones para estos filtros. Crea la primera para comenzar.'}</div> : null}
        </> : null}
        {tab === 'plans' ? <section className="grid gap-5 md:grid-cols-3">{overview.plans.map((plan) => <article key={plan.id} className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-xs uppercase tracking-widest text-emerald-700">{plan.code}</p><h2 className="mt-2 text-2xl font-bold">{plan.name}</h2><p className="mt-2 min-h-10 text-sm text-slate-500">{plan.description}</p><dl className="my-6 space-y-3 text-sm"><div className="flex justify-between"><dt>Cómputo</dt><dd>{plan.instanceType}</dd></div><div className="flex justify-between"><dt>vCPU / Memoria</dt><dd>{plan.vcpu} / {plan.memoryMb / 1024} GB</dd></div><div className="flex justify-between"><dt>Disco cifrado</dt><dd>{plan.storageGb} GB</dd></div><div className="flex justify-between"><dt>Estudiantes / Clases</dt><dd>{plan.maxStudents} / {plan.maxSessions}</dd></div></dl><button className={buttonClass} onClick={async () => { const students = window.prompt('Nuevo límite de estudiantes', String(plan.maxStudents)); if (students === null) return; const sessions = window.prompt('Nuevo límite de fechas de clase', String(plan.maxSessions)); if (sessions === null) return; try { await platformRequest(`plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ name: plan.name, maxStudents: Number(students), maxSessions: Number(sessions) }) }); setNotice('Configuración del plan guardada y auditada. Actualiza cada institución para aplicar los límites.'); await reload(); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'No se pudo editar el plan.'); } }}>Editar límites</button></article>)}</section> : null}
        {tab === 'alerts' ? <section className="space-y-3">{overview.alerts.length === 0 ? <p className="rounded-2xl bg-white p-8 text-center text-slate-500">No hay alertas activas.</p> : overview.alerts.map((alert) => <article key={alert.id} className="rounded-xl border border-red-200 bg-red-50 p-5"><div className="flex justify-between"><h2 className="font-bold text-red-900">{alert.name}</h2><Badge state={alert.state}/></div><p className="mt-2 text-sm text-red-800">{alert.message}</p><p className="mt-2 text-xs text-red-700">{alert.tenant?.name} · {dateText(alert.detectedAt)}</p></article>)}</section> : null}
      </> : <>
        <TenantInventory tenant={selected}/>
        {selected.architectureVersion < 2 ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5"><p className="max-w-2xl text-sm text-amber-900">Este tenant conserva la arquitectura anterior. Migra con respaldo para separar frontend, backend y base de datos.</p><button disabled={busy || acting} className={buttonClass} onClick={() => void showPreview("MIGRATE")}>Separar en 3 instancias</button></div> : null}
        <section className="grid gap-4 sm:grid-cols-4"><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Estado</p><div className="mt-3"><Badge state={selected.status}/></div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Plan / Cómputo</p><p className="mt-3 font-bold">{selected.plan.name} · {selected.plan.instanceType}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Salud del backend / Base</p><p className="mt-3 font-bold">{selected.health ? `${selected.health.available ? 'Disponible' : 'Sin respuesta'} / ${selected.health.database ? 'OK' : 'Por verificar'}` : 'Aún sin mediciones'}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Estudiantes / Límite</p><p className="mt-3 font-bold">{selected.health?.students ?? '—'} / {selected.plan.maxStudents}</p></div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-bold">Servicios y ciclo de vida</h2><p className="mt-2 text-sm text-slate-500">{selected.instanceId || 'Sin instancia todavía'} · Aplicación {selected.deployedVersion || 'pendiente'}</p></div><div className="flex gap-3">{selected.publicUrl ? <><a href={selected.publicUrl} target="_blank" rel="noreferrer" className={buttonClass}>Abrir aplicación ↗</a><a href={`${selected.publicUrl}/grafana/d/attendance-tenant`} target="_blank" rel="noreferrer" className={buttonClass}>Grafana ↗</a></> : null}</div></div><div className="mt-5 flex flex-wrap gap-2">{(selected.status === 'SUSPENDED' ? ['RESUME','DELETE'] : selected.status === 'FAILED' || selected.status === 'PENDING' ? ['DEPLOY','DELETE'] : ['UPDATE','SUSPEND','BACKUP','RESTORE','TEST_ALERT','CLEAR_ALERT','DELETE']).map((action) => <button key={action} disabled={busy || acting} className={`${buttonClass} ${action === 'DELETE' ? 'border-red-200 text-red-700' : ''}`} onClick={() => { if (action === 'DELETE') void showPreview(action); else if (action === 'RESTORE') { setConfirmAction(action); setPreview(['Se reemplazarán los datos actuales por el respaldo seleccionado. El servicio se reiniciará.']); } else void runAction(action); }}>{actionLabels[action]}</button>)}</div><p className="mt-4 text-xs text-slate-500">La suspensión detiene las tres instancias y conserva sus discos. Los respaldos se conservan en S3. Las operaciones AWS pueden generar cargos.</p></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-bold">Cambiar plan con vista previa</h2><div className="mt-4 flex gap-3"><select aria-label="Nuevo plan" value={targetPlan} onChange={(event) => setTargetPlan(event.target.value)} className={inputClass}><option value="">Selecciona otro plan</option>{overview.plans.filter((plan) => plan.id !== selected.plan.id).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.instanceType} · {plan.maxStudents} estudiantes</option>)}</select><button disabled={!targetPlan || busy} onClick={() => void showPreview('CHANGE_PLAN')} className={buttonClass}>Ver cambios</button></div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-bold">Respaldos disponibles</h2>{selected.backups?.length ? selected.backups.map((backup) => <div key={backup.id} className="mt-4 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-sm"><span>{dateText(backup.createdAt)}</span><span className="break-all text-xs text-slate-500">{backup.objectKey}</span></div>) : <p className="mt-3 text-sm text-slate-500">Todavía no hay respaldos. Usa Respaldar cuando los servicios estén activos.</p>}</section>
      </>}

      {selected || tab === 'operations' ? <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">Historial de operaciones</h2><div className="mt-5 space-y-4">{operations.map((operation) => <article key={operation.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{actionLabels[operation.action]} {operation.tenant?.name || ''}</h3><p className="mt-1 text-xs text-slate-500">{dateText(operation.createdAt)} · Usuario: {operation.actor}</p></div><div className="flex items-center gap-3"><Badge state={operation.state}/><button onClick={() => setExpandedLog(expandedLog === operation.id ? '' : operation.id)} className="text-xs font-semibold text-slate-600">{expandedLog === operation.id ? 'Ocultar detalle' : 'Ver detalle'}</button>{operation.state === 'FAILED' ? <button onClick={() => void retry(operation)} className={buttonClass}>Reintentar</button> : null}</div></div>{['QUEUED','RUNNING'].includes(operation.state) ? <><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${operation.progress}%` }}/></div><p className="mt-2 text-xs text-slate-500">{operation.logs.at(-1)} · {operation.progress}%</p></> : null}{operation.error ? <p className="mt-3 whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-sm text-red-800">{operation.error}</p> : null}{expandedLog === operation.id ? <div className="mt-4"><p className="text-xs text-slate-500">Aplicación {operation.appVersion} · Plantilla {operation.templateVersion} · {operation.toolVersion || 'Herramienta por verificar'}</p><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-xs leading-6 text-emerald-100">{operation.logs.join('\n')}</pre></div> : null}</article>)}{operations.length === 0 ? <p className="text-sm text-slate-500">No hay operaciones registradas.</p> : null}</div></section> : null}

      {creating ? <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4 sm:p-8"><section role="dialog" aria-modal="true" aria-labelledby="create-title" className="mx-auto max-w-2xl rounded-2xl bg-white p-6 sm:p-8"><div className="flex justify-between"><div><h2 id="create-title" className="text-2xl font-bold">Crear institución</h2><p className="mt-2 text-sm text-slate-500">Se aprovisionarán tres instancias independientes: frontend, backend y PostgreSQL.</p></div><button onClick={() => setCreating(false)} aria-label="Cerrar creación" className="text-xl">×</button></div><form onSubmit={handleSubmit(createTenant)} className="mt-6 space-y-4"><div className="grid gap-4 sm:grid-cols-2">{[['name','Nombre de la institución','Universidad Andina'],['slug','Identificador único','universidad-andina'],['contactEmail','Correo del administrador','contacto@institucion.edu'],['contactPhone','Teléfono de referencia','+591 70000000'],['adminPassword','Contraseña inicial del administrador','Mínimo 10 caracteres']].map(([key,label,placeholder]) => <label key={key} className="space-y-2 text-sm font-medium">{label}<input {...register(key as 'name' | 'slug' | 'contactEmail' | 'contactPhone' | 'adminPassword')} type={key === 'adminPassword' ? 'password' : key === 'contactEmail' ? 'email' : 'text'} placeholder={placeholder} className={inputClass}/>{errors[key as keyof TenantValues] ? <span className="block text-xs text-red-700">{errors[key as keyof TenantValues]?.message}</span> : null}</label>)}</div><label className="flex items-center gap-4 text-sm font-medium">Color de la institución<input type="color" {...register("color")} className="h-10 w-16 cursor-pointer rounded border border-slate-200"/></label><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">Entorno<select {...register('environment')} className={inputClass}><option value="dev">Desarrollo</option><option value="staging">Pruebas</option><option value="prod">Producción</option></select></label><label className="space-y-2 text-sm font-medium">Motor de aprovisionamiento<select {...register('engine')} className={inputClass}><option value="terraform">Terraform</option><option value="cloudformation">CloudFormation</option><option value="opentofu">OpenTofu (requiere instalación)</option><option value="pulumi" disabled>Pulumi · comparación documentada</option></select></label></div><fieldset><legend className="text-sm font-semibold">Selecciona un plan</legend><div className="mt-3 grid gap-3 sm:grid-cols-3">{overview.plans.map((plan) => <label key={plan.id} className={`cursor-pointer rounded-xl border p-4 ${selectedPlan === plan.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200'}`}><input type="radio" value={plan.id} {...register('planId')} className="mr-2"/><span className="text-sm font-bold">{plan.name}</span><p className="mt-2 text-xs leading-6 text-slate-600">{plan.instanceType}<br/>{plan.memoryMb/1024} GB RAM · {plan.storageGb} GB disco<br/>{plan.maxStudents} estudiantes</p></label>)}</div>{errors.planId ? <p className="mt-2 text-xs text-red-700">{errors.planId.message}</p> : null}</fieldset><p className="text-xs leading-5 text-slate-500">La contraseña se almacena cifrada y se entrega a la instancia mediante SSM SecureString. Se crearán recursos facturables de AWS. El acceso HTTP se restringe a la red configurada para la presentación.</p><div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" className={buttonClass} onClick={() => setCreating(false)}>Cancelar</button><button disabled={isSubmitting} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{isSubmitting ? 'Registrando...' : 'Crear y desplegar'}</button></div></form></section></div> : null}

      {confirmAction && selected ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-5"><section role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-lg rounded-2xl bg-white p-6"><h2 id="confirm-title" className="text-xl font-bold">{actionLabels[confirmAction]} · {selected.name}</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">{preview.map((line) => <li key={line}>{line}</li>)}</ul>{confirmAction === 'RESTORE' ? <select aria-label="Respaldo a restaurar" value={backupId} onChange={(event) => setBackupId(event.target.value)} className={`${inputClass} mt-4`}><option value="">Selecciona un respaldo</option>{selected.backups?.map((backup) => <option key={backup.id} value={backup.id}>{dateText(backup.createdAt)}</option>)}</select> : null}{['DELETE','RESTORE','MIGRATE'].includes(confirmAction) ? <label className="mt-5 block text-sm font-medium">Escribe <strong>{selected.slug}</strong> para confirmar<input aria-label="Confirmar identificador" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={`${inputClass} mt-2`}/></label> : null}<div className="mt-6 flex justify-end gap-3"><button className={buttonClass} onClick={() => { setConfirmAction(''); setConfirmation(''); }}>Cancelar</button><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={acting || (['DELETE','RESTORE','MIGRATE'].includes(confirmAction) && confirmation !== selected.slug) || (confirmAction === 'RESTORE' && !backupId)} onClick={() => void runAction(confirmAction)}>{acting ? 'Registrando...' : 'Confirmar operación'}</button></div></section></div> : null}
    </main>
  );
}
