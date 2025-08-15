import { test, expect } from '@playwright/test';

// Ensure sessions imported with a duration contribute to totalHours
// on the statistics endpoint.
test('auto-imported Lichess sessions increase totalHours', async ({ request }) => {
  // start from a clean slate
  await request.post('/api/import', { data: { data: JSON.stringify([]) } });

  let res = await request.get('/api/statistics');
  let stats = await res.json();
  expect(stats.totalHours).toBe(0);

  const imported = [
    {
      id: 1,
      type: 'game',
      date: new Date().toISOString(),
      duration: 30,
      gameResult: 'win',
      playerColor: 'white',
      platform: 'lichess',
      timeControl: '5+3',
      needsReview: false,
    },
  ];

  await request.post('/api/import', { data: { data: JSON.stringify(imported) } });

  res = await request.get('/api/statistics');
  stats = await res.json();
  expect(stats.totalHours).toBeCloseTo(0.5, 5); // 30 minutes = 0.5 hours
});
