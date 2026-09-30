import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('Выбор классов, пересчёт изменений и сохранение остальных учеников', async ({
  page,
  request,
}, testInfo) => {
  const headers = { Authorization: 'Bearer e2e-test-key' };
  const file = {
    name: 'crm.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await readFile(new URL('./fixtures/crm.xlsx', import.meta.url)),
  };
  const restore = async () => {
    const preview = await request.post('/api/imports/preview', { headers, multipart: { file } });
    expect(preview.ok()).toBe(true);
    const applied = await request.post('/api/imports/apply', {
      headers,
      multipart: { file, confirmation: (await preview.json()).confirmation },
    });
    expect(applied.ok()).toBe(true);
  };
  await restore();
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Сотрудник', exact: true }).click();
    await page.getByLabel('Ключ доступа').fill('e2e-test-key');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByRole('link', { name: 'Школа', exact: true }).click();
    await page.getByRole('link', { name: 'Импорт CRM', exact: true }).click();
    await page
      .getByLabel('Файл CRM')
      .setInputFiles(fileURLToPath(new URL('./fixtures/grades.xlsx', import.meta.url)));
    await expect(page.getByText('В файле: 4 учеников')).toBeVisible();
    await expect(page.locator('.grade-option').filter({ hasText: '9 класс' }).locator('strong')).toHaveText(
      '2',
    );
    await expect(page.getByRole('checkbox', { name: 'Без класса', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Снять выбор', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Показать изменения', exact: true })).toBeDisabled();
    await page.getByRole('checkbox', { name: '9 класс', exact: true }).check();
    await expect(page.getByText('Выбрано: 2 из 4 учеников')).toBeVisible();
    await page.getByRole('button', { name: 'Показать изменения', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Изменения импорта' })).toContainText('Выбранов Иван');
    await expect(page.getByRole('table', { name: 'Изменения импорта' })).not.toContainText('Пропусков');
    await page.getByRole('checkbox', { name: 'Без класса', exact: true }).check();
    await expect(page.getByRole('button', { name: 'Применить изменения', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Выбрать все', exact: true }).click();
    await expect(page.getByText('Выбрано: 4 из 4 учеников')).toBeVisible();
    await page.getByRole('checkbox', { name: '11 класс', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Без класса', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Показать изменения', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Применить изменения', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('import-grades-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('import-grades-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Применить изменения', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('К импорту: 2 учеников');
    await expect(page.getByRole('dialog')).toContainText('В архив перейдут: 0');
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    await expect(page.getByText('Изменения применены. Ученики, группы и учителя обновлены.')).toBeVisible();
    const students = await (await request.get('/api/students', { headers })).json();
    expect(students.filter((s: { is_active: boolean }) => s.is_active)).toHaveLength(5);
    expect(students.some((s: { external_id: string }) => s.external_id === 'grade-11')).toBe(false);
    expect(students.some((s: { external_id: string }) => s.external_id === 'grade-unknown')).toBe(false);
  } finally {
    await restore();
  }
});
