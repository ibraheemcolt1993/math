import { test, expect } from '@playwright/test';

const mathToken = '[[math:\\frac{1}{2}+x^2]]';

const adminWeekPayload = {
  ok: true,
  seq: 1,
  title: 'بطاقة اختبار المعادلات',
  goals: [`هدف ${mathToken}`],
  prerequisites: [],
  concepts: [
    {
      title: 'مفهوم',
      flow: [
        { type: 'goal', text: `شرح ${mathToken}` },
        { type: 'explain', text: `تفصيل ${mathToken}` }
      ]
    }
  ],
  assessment: { title: 'تقييم', description: '', questions: [] }
};

const lessonPayload = {
  title: 'بطاقة اختبار المعادلات',
  goals: [`هدف ${mathToken}`],
  prerequisites: [],
  concepts: [
    {
      title: 'مفهوم',
      flow: [
        { type: 'goal', text: `شرح ${mathToken}` }
      ]
    }
  ],
  assessment: { title: 'تقييم', description: '', questions: [] }
};

test('renders math tokens in admin preview', async ({ page }) => {
  await page.route('**/api/ain/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, user: { username: 'tester' } })
    });
  });

  await page.route('**/api/mng/weeks/**/content', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(adminWeekPayload)
    });
  });

  await page.goto('/mng/card-editor.html?week=1');
  await page.locator('#previewToggle').check();

  await expect(page.locator('#lessonContent .mathx-inline')).toHaveCount(1);
  await expect(page.locator('#lessonContent')).not.toContainText('[[math:');
});

test('renders math tokens in lesson page', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('math:lastStudentId', '101');
    localStorage.setItem(
      'math:studentSession',
      JSON.stringify({ id: '101', firstName: 'اختبار', fullName: 'اختبار' })
    );
  });

  await page.route('**/api/weeks/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(lessonPayload)
    });
  });

  await page.goto('/lesson.html?week=1');

  await expect(page.locator('#lessonContent .mathx-inline')).toHaveCount(1);
  await expect(page.locator('#lessonContent')).not.toContainText('[[math:');
});
