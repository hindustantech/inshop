// utils/date.util.js

export const normalizeToUTCDate = (date = new Date()) => {

    const d = new Date(date);

    return new Date(Date.UTC(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        0, 0, 0
    ));
};


export const buildDateRange = (from, to) => {

    const start = normalizeToUTCDate(new Date(from));

    const end = new Date(
        Date.UTC(
            new Date(to).getFullYear(),
            new Date(to).getMonth(),
            new Date(to).getDate(),
            23, 59, 59
        )
    );

    return { start, end };
};
