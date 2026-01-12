import axios from "axios";

/**
 * Send WhatsApp message
 * Plain text (approved template friendly)
 */
export async function sendWhatsapp({ to, message }) {
    try {
        const payload = {
            messaging_product: "whatsapp",
            to: to.startsWith("91") ? to : `91${to}`, // country-safe
            type: "text",
            text: {
                body: message,
            },
        };

        const response = await axios.post(
            process.env.WHATSAPP_API_URL,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log(`WhatsApp sent to ${to}`);
        return response.data;
    } catch (error) {
        console.error(
            "WhatsApp send failed:",
            error.response?.data || error.message
        );
        throw error;
    }
}
