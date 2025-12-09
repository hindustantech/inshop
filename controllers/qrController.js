import QRCode from "qrcode";
import path from "path";
import fs from "fs";

export const generateQR = async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                ok: false,
                message: "URL is required to generate QR code",
            });
        }

        // 1️⃣ Generate Base64 QR Code
        const qrImage = await QRCode.toDataURL(url);

        // 2️⃣ Create PNG File for Download
        const qrFileName = `qr_${Date.now()}.png`;
        const qrFilePath = path.join("uploads/qr", qrFileName);

        // Ensure upload folder exists
        if (!fs.existsSync("uploads/qr")) {
            fs.mkdirSync("uploads/qr", { recursive: true });
        }

        await QRCode.toFile(qrFilePath, url);

        return res.status(200).json({
            ok: true,
            message: "QR Code generated successfully",
            qrBase64: qrImage,
            downloadUrl: `/download/qr/${qrFileName}`,
        });
    } catch (error) {
        console.error("QR Generate Error:", error);
        return res.status(500).json({
            ok: false,
            message: "Failed to generate QR code",
            error: error.message,
        });
    }
};



export const downloadQR = async (req, res) => {
    try {
        const { file } = req.params;
        const filePath = path.join("uploads/qr", file);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                ok: false,
                message: "QR file not found",
            });
        }

        return res.download(filePath);
    } catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error downloading QR",
        });
    }
};
