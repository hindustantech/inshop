import multer from "multer";

const storage = multer.memoryStorage();

export const uploadMallFiles = multer({ storage }).fields([
    { name: "logo", maxCount: 1 },
    { name: "gallery", maxCount: 10 },
]);
