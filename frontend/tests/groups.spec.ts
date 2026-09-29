import { test, expect } from '@playwright/test';

test('Возврат к странице групп и открытие группы по прямой ссылке', async ({ page }) => {
  await page.route(/\/api\/groups\?/, (route) =>
    route.fulfill({
      json: Array.from({ length: 21 }, (_, index) => ({
        id: 100 + index,
        source_name: `Математика Группа ${index + 1}`,
        display_name: `Группа ${index + 1}`,
        subject: 'Математика',
        teacher_id: null,
        teacher_name: null,
        schedule: null,
        is_active: true,
      })),
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Сотрудник', exact: true }).click();
  await page.getByLabel('Ключ доступа').fill('e2e-test-key');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('link', { name: 'Группы', exact: true }).click();
  await page.getByRole('button', { name: 'Следующая страница' }).click();
  await expect(page).toHaveURL(/#\/groups\?page=2$/);
  const groupLink = page.getByRole('link', { name: 'Математика Группа 21', exact: true });
  await groupLink.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('table', { name: 'Группы' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Математика Группа 21', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'Назад к группам' }).click();
  await expect(page).toHaveURL(/#\/groups\?page=2$/);
  await expect(groupLink).toBeVisible();
  await page.goto('/#/groups/120');
  await expect(page.getByRole('heading', { name: 'Математика Группа 21', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Назад к группам' }).click();
  await expect(page).toHaveURL(/#\/groups$/);
  await page.goto('/#/groups/999');
  await expect(page.getByText('Группа не найдена', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Назад к группам' }).click();
  await expect(page.getByRole('table', { name: 'Группы' })).toBeVisible();
});
