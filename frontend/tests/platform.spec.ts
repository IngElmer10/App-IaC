import { expect, test } from "@playwright/test";

test.skip(process.env.MVP_TEST_ATTENDANCE === "1", "Esta suite requiere el modo plataforma.");

test('plataforma: acceso, catálogo, creación validada e historial de despliegues', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByRole('button', { name: 'Plataforma', exact: true }).click();
  await page.getByLabel('Contraseña', { exact: true }).fill('platform123');
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
  await expect(page.getByRole('heading', { name: 'Plataforma de instituciones' })).toBeVisible();
  await page.getByRole('button', { name: 'Planes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Básico', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Estándar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Crear institución', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Crear y desplegar', exact: true }).click();
  await expect(page.getByText('Escribe al menos 3 caracteres.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Operaciones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Historial de operaciones' })).toBeVisible();
  await page.getByRole('button', { name: 'Salir', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('página pública: planes, formulario validado y color sin sesión', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Tu institución/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Básico', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Solicitar mi plataforma' }).click();
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByText('Escribe al menos 3 caracteres.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Color de la institución')).toHaveValue('#059669');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('plataforma: el acceso sin sesión redirige al login en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/platform');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('solicitud real: envío público, bandeja administrativa y rechazo sin crear recursos', async ({ page }) => {
  const slug = `browser-${Date.now().toString(36)}`;
  await page.goto('/');
  await page.getByLabel('Nombre de la institución', { exact: true }).fill('Prueba solicitud navegador');
  await page.getByLabel('Identificador', { exact: true }).fill(slug);
  await page.getByLabel('Correo del administrador', { exact: true }).fill('prueba-navegador@example.com');
  await page.getByLabel('Número de contacto', { exact: true }).fill('+591 70000000');
  await page.getByLabel('Contraseña del administrador', { exact: true }).fill('browser-test-owner');
  await page.getByLabel('Color de la institución').fill('#7c3aed');
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByRole('heading', { name: '¡Solicitud recibida!' })).toBeVisible();
  await page.goto('/login');
  await page.getByRole('button', { name: 'Plataforma', exact: true }).click();
  await page.getByLabel('Contraseña', { exact: true }).fill('platform123');
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
  await page.getByRole('button', { name: /Solicitudes \(/ }).click();
  await page.getByLabel('Buscar solicitud').fill(slug);
  await expect(page.getByRole('heading', { name: 'Prueba solicitud navegador' })).toBeVisible();
  await page.getByRole('button', { name: 'Rechazar', exact: true }).click();
  await page.getByLabel('Motivo del rechazo').fill('Prueba automática de interfaz, no aprovisionar');
  await page.getByRole('button', { name: 'Confirmar rechazo' }).click();
  await expect(page.getByText('Solicitud rechazada y contraseña eliminada de la solicitud.', { exact: true })).toBeVisible();
});
