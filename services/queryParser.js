const MAX_RADIUS = 100000; // 100 km

export function parseAndValidateMallQuery(query) {
    const { radius = MAX_RADIUS, search = '', page = 1, limit = 50, manualCode, lat, lng } = query;

    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    let parsedRadius = parseInt(radius);

    if (isNaN(parsedPage) || parsedPage < 1) throw new Error('Invalid page');
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) throw new Error('Invalid limit');
    if (isNaN(parsedRadius) || parsedRadius < 0) throw new Error('Invalid radius');

    parsedRadius = Math.min(parsedRadius, MAX_RADIUS); // enforce 100 km max

    if ((lat && isNaN(Number(lat))) || (lng && isNaN(Number(lng)))) throw new Error('Invalid lat/lng');

    const skip = (parsedPage - 1) * parsedLimit;

    return { parsedPage, parsedLimit, parsedRadius, search, manualCode, lat, lng, skip };
}
