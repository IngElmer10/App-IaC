import { expect, test } from "@playwright/test";

test.skip(process.env.MVP_TEST_ATTENDANCE !== "1", "Activa MVP_TEST_ATTENDANCE=1 con el modo de demostración de asistencia.");

test("login, navegación administrativa, filtros, plantillas y exportación", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Administrador", exact: true }).click();
  await page.getByLabel("Contraseña", { exact: true }).fill("admin123");
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Módulo de demostración", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nuevo módulo", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Estudiantes", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Ana García", exact: true })).toBeVisible();
  await page.getByLabel("Buscar por nombre o número de registro").fill("DEMO1001");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByText("1 estudiante", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByText("1 estudiante", { exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Cargar Excel", exact: true }).click();
  const template = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar plantilla de estudiantes" }).click();
  expect((await template).suggestedFilename()).toBe("plantilla-estudiantes.xlsx");
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Asistencias", exact: true }).click();
  await expect(page.getByText(/registros de asistencia$/)).toBeVisible();
  const correction = page.getByRole("combobox", { name: /Corregir asistencia de Mateo Quispe/ }).first();
  const correctedStatus = await correction.inputValue() === "PRESENT" ? "ABSENT" : "PRESENT";
  await correction.selectOption(correctedStatus);
  await expect(correction).toHaveValue(correctedStatus);
  await expect(page.getByText(/Asistencia de Mateo Quispe actualizada/)).toBeVisible();
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar Excel", exact: true }).click();
  expect((await exported).suggestedFilename()).toBe("asistencias.xlsx");
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Actividades", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Actividades del módulo activo" })).toBeVisible();
  await page.getByRole("textbox", { name: "Filtrar por estudiante", exact: true }).fill("Ana");
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Marcó asistencia", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("estudiante marca hoy y ve su historial desde un teléfono", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Usuario", { exact: true }).fill("DEMO1006");
  await page.getByLabel("Contraseña", { exact: true }).fill("12345678");
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await expect(page.getByRole("heading", { name: "Mateo Quispe", exact: true })).toBeVisible();
  const markButton = page.getByRole("button", { name: "Marcar asistencia", exact: true });
  if (await markButton.count()) {
    await markButton.click();
    await expect(page.getByText("Tu asistencia se registró correctamente.")).toBeVisible();
  }
  await expect(markButton).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Historial de asistencia" })).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole("heading", { name: "Mateo Quispe", exact: true })).toBeVisible();
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflows).toBe(false);
});

test("rechaza credenciales inválidas y protege el portal sin sesión", async ({ page }) => {
  await page.goto("/admin/import");
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await page.getByLabel("Usuario", { exact: true }).fill("desconocido");
  await page.getByLabel("Contraseña", { exact: true }).fill("incorrecta");
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await expect(page.getByText("Credenciales inválidas", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page.evaluate(() => localStorage.setItem("session", "sesion-invalida"));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
});
