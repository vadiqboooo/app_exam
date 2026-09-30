import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

async function staffLogin(page: Page, teacher = false) {
  await page.getByRole('button', { name: teacher ? 'Учитель' : 'Сотрудник', exact: true }).click();
  if (teacher) {
    await page.getByLabel('Имя', { exact: true }).fill('Вадим');
    await page.getByLabel('Отчество', { exact: true }).fill('Сергеевич');
  } else {
    await page.getByLabel('Ваше имя').fill('Администратор');
    await page.getByLabel('Ключ доступа').fill('e2e-test-key');
  }
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: teacher ? 'Мои группы' : 'Главная', exact: true }),
  ).toBeVisible();
}

async function studentLogin(page: Page) {
  await page.getByLabel('Фамилия', { exact: true }).fill('Иванов');
  await page.getByLabel('Имя', { exact: true }).fill('Алексей');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Расписание пробных экзаменов' })).toBeVisible();
}

async function openAvailableExam(page: Page, title: string) {
  const cardButton = page
    .locator('article.available-exam-card')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Записаться', exact: true });
  const chooseButton = page.getByRole('button', { name: 'Записаться на ещё один предмет', exact: true });
  const firstBookingButton = page.getByRole('button', { name: 'Записаться на пробник', exact: true });
  await cardButton.or(chooseButton).or(firstBookingButton).first().click();
}

test('Excel → экзамен → запись → явка → проверка → публикация → результат ученика', async ({
  page,
  browser,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.screenshot({ path: testInfo.outputPath('login-desktop.png'), fullPage: true });
  await staffLogin(page);
  await page.getByRole('link', { name: 'Школа', exact: true }).click();
  await page.getByRole('link', { name: 'Импорт CRM', exact: true }).click();
  await page
    .getByLabel('Файл CRM')
    .setInputFiles(fileURLToPath(new URL('./fixtures/crm.xlsx', import.meta.url)));
  await expect(page.getByText('Анализ завершён')).toBeVisible();
  await expect(page.getByText('В файле: 3 учеников')).toBeVisible();
  await page.getByRole('button', { name: 'Показать изменения', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('import-preview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Применить изменения', exact: true }).click();
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect(page.getByText('Изменения применены. Ученики, группы и учителя обновлены.')).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await staffLogin(page, true);
  const groupsTable = page.getByRole('table', { name: 'Мои группы', exact: true });
  await expect(page.locator('.topbar').getByRole('heading', { name: 'Мои группы' })).toBeVisible();
  const informatics = groupsTable.getByRole('row').filter({ hasText: 'Информатика' });
  await expect(informatics.getByRole('cell', { name: 'Вадим Сергеевич', exact: true })).toBeVisible();
  await expect(informatics.getByRole('cell', { name: 'ЕГЭ', exact: true })).toBeVisible();
  await expect(informatics.getByRole('cell', { name: 'СР 16:30-19:30', exact: true })).toBeVisible();
  await expect(informatics.getByRole('cell', { name: '2', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('groups-desktop.png'), fullPage: true });
  await informatics.getByRole('cell', { name: 'Информатика', exact: true }).click();
  await expect(groupsTable).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Ученики группы' }).getByText('Петрова Анна')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ученики группы' })).toBeVisible();
  await page.getByRole('link', { name: 'Назад к группам' }).click();
  await expect(groupsTable).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.topbar').getByRole('heading', { name: 'Мои группы' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('groups-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await staffLogin(page);
  await page.getByRole('link', { name: 'Школа', exact: true }).click();
  await page.getByRole('link', { name: 'Предметы', exact: true }).click();
  const informaticsSettings = page
    .getByRole('table', { name: 'Настройки предметов' })
    .getByRole('row')
    .filter({ hasText: 'Информатика' })
    .filter({ hasText: 'ЕГЭ' });
  await expect(informaticsSettings).toContainText('27');
  await expect(informaticsSettings).toContainText('29');
  await page.getByRole('link', { name: 'Пробники', exact: true }).click();
  await page.getByRole('button', { name: 'Создать пробник', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Создать пробник' });
  await create.getByRole('checkbox', { name: 'ЕГЭ · Информатика', exact: true }).check();
  await create.getByLabel('Название', { exact: true }).fill('Осенний пробник');
  const starts = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 16);
  await create.getByLabel('Дата и время', { exact: true }).fill(starts);
  await create.getByLabel('Название школы', { exact: true }).fill('Школа № 1');
  await create.getByLabel('Адрес школы', { exact: true }).fill('Учебная, 1');
  await expect(create.getByText('27 заданий · до 29 баллов', { exact: true }).first()).toBeVisible();
  await create.getByRole('button', { name: 'Создать пробник', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Осенний пробник' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Удалить', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Редактировать пробник' });
  await expect(edit.getByLabel('Название', { exact: true })).toHaveValue('Осенний пробник');
  await edit.getByLabel('Количество мест', { exact: true }).fill('21');
  await edit.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Расписание пробника' }).getByRole('cell', { name: '21' }).first(),
  ).toBeVisible();
  await page.getByRole('link').filter({ hasText: 'ЕГЭ · Информатика' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'ЕГЭ · Информатика' })).toBeVisible();
  await page.getByRole('link', { name: 'Главная', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Главная', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await studentLogin(page);
  await openAvailableExam(page, 'Осенний пробник');
  const booking = page.getByRole('region', { name: 'Запись на экзамен' });
  await booking
    .getByRole('radiogroup', { name: 'Дата и время записи' })
    .getByRole('radio')
    .check({ force: true });
  await booking.getByRole('button', { name: 'Записаться', exact: true }).click();
  await expect(booking).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Предстоящие экзамены' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Информатика', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await staffLogin(page, true);
  await page
    .getByRole('table', { name: 'Мои группы' })
    .getByRole('row')
    .filter({ hasText: 'Информатика' })
    .getByRole('link')
    .click();
  await expect(page.getByText('Иванов Алексей', { exact: true })).toBeVisible();
  await expect(page.getByText('Петрова Анна', { exact: true })).toBeVisible();
  const results = page.locator('.student-result-list');
  let result = results.getByRole('article', { name: 'Результат ученика Иванов Алексей' });
  await expect(result.getByLabel('Балл за задание 1 — Иванов Алексей', { exact: true })).toHaveValue('');
  await expect(result.getByLabel('Балл за задание 1 — Иванов Алексей', { exact: true })).toHaveAttribute(
    'placeholder',
    '—',
  );
  expect(
    await result
      .locator('.student-task-field')
      .evaluateAll(
        (fields) => new Set(fields.map((field) => Math.round(field.getBoundingClientRect().top))).size,
      ),
  ).toBe(2);
  expect(await result.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await result.getByLabel('Балл за задание 1 — Иванов Алексей', { exact: true }).fill('1');
  await result.getByLabel('Балл за задание 2 — Иванов Алексей', { exact: true }).fill('1');
  await result
    .getByLabel('Комментарий по результатам работы — Иванов Алексей', { exact: true })
    .fill('Хорошая работа. Продолжайте практиковаться.');
  await result.getByRole('button', { name: 'Сохранить результат — Иванов Алексей', exact: true }).click();
  await expect(result.getByText('Проверено', { exact: true })).toBeVisible();
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const student = await studentContext.newPage();
  await student.goto('/');
  await studentLogin(student);
  await student.screenshot({ path: testInfo.outputPath('student-mobile.png'), fullPage: true });
  await student.getByRole('link', { name: 'Мои результаты', exact: true }).click();
  await expect(student.getByText('Ваша история результатов начинается здесь')).toBeVisible();
  result = results.getByRole('article', { name: 'Результат ученика Иванов Алексей' });
  await result.getByRole('button', { name: 'Опубликовать результат — Иванов Алексей', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Опубликовать результат?' })
    .getByRole('button', { name: 'Опубликовать', exact: true })
    .click();
  await expect(result.getByText('Опубликован', { exact: true })).toBeVisible();
  await student.reload();
  await student.getByRole('button', { name: /Осенний пробник/ }).click();
  const details = student.getByRole('dialog', { name: 'Подробный результат' });
  await expect(details.locator('.stats-grid').getByText('14', { exact: true })).toBeVisible();
  await expect(details.getByText('Хорошая работа. Продолжайте практиковаться.')).toBeVisible();
  await student.screenshot({ path: testInfo.outputPath('result-mobile.png'), fullPage: true });
  await details.getByRole('button', { name: 'Закрыть', exact: true }).click();
  expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await studentContext.close();
});

test('Пробник с ЕГЭ и ОГЭ, двумя школами и ограничением мест', async ({
  page,
  browser,
  request,
}, testInfo) => {
  const headers = { Authorization: 'Bearer e2e-test-key' };
  const file = {
    name: 'crm.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await readFile(new URL('./fixtures/crm.xlsx', import.meta.url)),
  };
  const preview = await request.post('/api/imports/preview', { headers, multipart: { file } });
  const applied = await request.post('/api/imports/apply', {
    headers,
    multipart: { file, confirmation: (await preview.json()).confirmation },
  });
  expect(applied.ok()).toBe(true);
  await page.goto('/');
  await staffLogin(page);
  await page.getByRole('link', { name: 'Пробники', exact: true }).click();
  await page.getByRole('button', { name: 'Создать пробник', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Создать пробник' });
  await create.getByLabel('Название', { exact: true }).fill('Городской пробник');
  await create.getByRole('checkbox', { name: 'ЕГЭ · Физика', exact: true }).check();
  await create.getByRole('checkbox', { name: 'ОГЭ · Биология', exact: true }).check();
  const firstSchool = create.getByRole('region', { name: 'Школа 1', exact: true });
  const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 16);
  await firstSchool.getByLabel('Название школы').fill('Школа № 10');
  await firstSchool.getByLabel('Адрес школы').fill('Школьная, 10');
  await firstSchool.getByLabel('Дата и время', { exact: true }).fill(future(20));
  await firstSchool.getByLabel('Количество мест').fill('1');
  await firstSchool.getByRole('button', { name: 'Добавить время' }).click();
  await firstSchool.getByLabel('Дата и время', { exact: true }).nth(1).fill(future(21));
  await firstSchool.getByLabel('Количество мест').nth(1).fill('1');
  await create.getByRole('button', { name: 'Добавить школу' }).click();
  const secondSchool = create.getByRole('region', { name: 'Школа 2', exact: true });
  await secondSchool.getByLabel('Название школы').fill('Школа № 20');
  await secondSchool.getByLabel('Дата и время', { exact: true }).fill(future(22));
  await secondSchool.getByLabel('Количество мест').fill('2');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await create.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('create-event-mobile.png'), fullPage: true });
  await create.getByRole('button', { name: 'Создать пробник', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Городской пробник' })).toBeVisible();
  const schedule = page.getByRole('table', { name: 'Расписание пробника' });
  await expect(schedule.getByRole('row')).toHaveCount(4);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath('event-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await studentLogin(page);
  await openAvailableExam(page, 'Городской пробник');
  let booking = page.getByRole('region', { name: 'Запись на экзамен' });
  let event = booking
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Городской пробник' }) });
  await event
    .getByRole('group', { name: 'Школа' })
    .getByRole('button', { name: /Школа № 10/ })
    .click();
  await event
    .getByRole('radiogroup', { name: 'Дата и время записи' })
    .getByRole('radio')
    .first()
    .check({ force: true });
  await expect(event.getByText('1 из 1 мест').first()).toBeVisible();
  await event.getByRole('button', { name: 'Записаться', exact: true }).click();
  await expect(booking).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Физика', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Записаться на ещё один предмет', exact: true }),
  ).toBeVisible();

  const physicsCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Физика', exact: true }) });
  await physicsCard.click();
  let editRegistration = page.getByRole('region', { name: 'Изменение записи: Физика' });
  await editRegistration
    .getByRole('radiogroup', { name: 'Дата и время записи' })
    .getByRole('radio')
    .nth(1)
    .check({ force: true });
  await editRegistration.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(editRegistration).not.toBeVisible();
  await physicsCard.click();
  editRegistration = page.getByRole('region', { name: 'Изменение записи: Физика' });
  await editRegistration
    .getByRole('radiogroup', { name: 'Дата и время записи' })
    .getByRole('radio')
    .first()
    .check({ force: true });
  await editRegistration.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(editRegistration).not.toBeVisible();

  const otherContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const other = await otherContext.newPage();
  await other.goto('/');
  await other.getByLabel('Фамилия', { exact: true }).fill('Петрова');
  await other.getByLabel('Имя', { exact: true }).fill('Анна');
  await other.getByRole('button', { name: 'Войти', exact: true }).click();
  await openAvailableExam(other, 'Городской пробник');
  const otherBooking = other.getByRole('region', { name: 'Запись на экзамен' });
  const cityTab = otherBooking.getByRole('tab', { name: /Городской пробник/ });
  if (await cityTab.count()) await cityTab.click();
  const otherEvent = otherBooking
    .getByRole('article')
    .filter({ has: other.getByRole('heading', { name: 'Городской пробник' }) });
  await otherEvent
    .getByRole('group', { name: 'Школа' })
    .getByRole('button', { name: /Школа № 10/ })
    .click();
  await expect(
    otherEvent.getByRole('radiogroup', { name: 'Дата и время записи' }).getByRole('radio').first(),
  ).toBeDisabled();
  await expect(otherEvent.getByRole('button', { name: 'Записаться', exact: true })).toBeDisabled();
  await otherEvent
    .getByRole('group', { name: 'Школа' })
    .getByRole('button', { name: /Школа № 20/ })
    .click();
  await otherEvent
    .getByRole('radiogroup', { name: 'Дата и время записи' })
    .locator('label.time-choice')
    .click();
  await otherEvent.getByRole('button', { name: 'Записаться', exact: true }).click();
  await expect(otherBooking).not.toBeVisible();
  await expect(other.getByRole('heading', { name: 'Физика', exact: true })).toBeVisible();
  expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await other.screenshot({ path: testInfo.outputPath('event-student-mobile.png'), fullPage: true });

  await page.setViewportSize({ width: 1100, height: 650 });
  await openAvailableExam(page, 'Городской пробник');
  booking = page.getByRole('region', { name: 'Запись на экзамен' });
  event = booking
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Городской пробник' }) });
  await event.getByRole('group', { name: 'Формат' }).getByRole('button', { name: 'ОГЭ' }).click();
  await expect(
    event.getByRole('group', { name: 'Предмет' }).getByRole('button', { name: /Биология/ }),
  ).toBeVisible();
  await event
    .getByRole('group', { name: 'Школа' })
    .getByRole('button', { name: /Школа № 10/ })
    .click();
  await event
    .getByRole('radiogroup', { name: 'Дата и время записи' })
    .locator('label.time-choice')
    .nth(1)
    .click();
  const registerAgain = event.getByRole('button', { name: 'Записаться', exact: true });
  await expect(registerAgain).toBeInViewport();
  await event.getByRole('button', { name: 'Изменить время', exact: true }).click();
  await expect(
    event.getByRole('radiogroup', { name: 'Дата и время записи' }).getByRole('radio').nth(1),
  ).not.toBeChecked();
  await event
    .getByRole('radiogroup', { name: 'Дата и время записи' })
    .locator('label.time-choice')
    .nth(1)
    .click();
  await registerAgain.click();
  await expect(booking).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('heading', { name: 'Физика', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Биология', exact: true })).toBeVisible();
  const exams = await (await request.get('/api/exams', { headers })).json();
  const subjects = exams.filter((e: { title: string }) => e.title === 'Городской пробник');
  expect(subjects).toHaveLength(2);
  expect(subjects[0].slots.map((s: { booked: number }) => s.booked)).toEqual([1, 1, 1]);
  expect(subjects[1].slots.map((s: { booked: number }) => s.booked)).toEqual([1, 1, 1]);
  const biologyCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Биология', exact: true }) });
  await biologyCard.getByRole('button', { name: 'Удалить', exact: true }).click();
  const deleteRegistration = page.getByRole('dialog', { name: 'Удалить запись?' });
  await deleteRegistration.getByRole('button', { name: 'Удалить запись', exact: true }).click();
  await expect(deleteRegistration).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Биология', exact: true })).toHaveCount(0);
  await otherContext.close();

  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await staffLogin(page);
  await page.getByRole('link', { name: 'Пробники', exact: true }).click();
  await page.getByRole('link').filter({ hasText: 'Городской пробник' }).click();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  const removal = page.getByRole('dialog', { name: 'Удалить пробник?' });
  await removal.getByRole('button', { name: 'Удалить пробник', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Пробники' })).toBeVisible();
  await expect(page.getByText('Городской пробник')).toHaveCount(0);
});
