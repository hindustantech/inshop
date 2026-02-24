

// utils/date.util.js

export const normalizeToUTCDate = (date = new Date()) => {
    const d = new Date(date);

    d.setHours(0, 0, 0, 0);  // Start of day in server timezone

    return d;
};

export const buildDateRange = (from, to) => {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);

    const end = new Date(to);
    end.setHours(23, 59, 59, 999);

    return { start, end };
};




