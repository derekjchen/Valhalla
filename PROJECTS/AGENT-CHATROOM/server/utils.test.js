const { formatTimestamp, getToday } = require('./utils');

describe('Utility Functions', () => {
    test('formatTimestamp returns ISO format', () => {
        const ts = formatTimestamp();
        expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('getToday returns YYYY-MM-DD format', () => {
        const today = getToday();
        expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
