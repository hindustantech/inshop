import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verify Google token ownership & authenticity
 * Ensures token is issued by Google and belongs to your app
 */
export const verifyGoogleOwnership = async (idToken) => {
    try {
        if (!idToken) {
            throw new Error("Missing idToken");
        }

        // 🔐 Verify token with Google
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        log("Google token payload:", payload);

        if (!payload) {
            throw new Error("Invalid token payload");
        }

        // 🔒 Ownership & security checks

        // 1. Issuer validation (must be Google)
        const validIssuers = [
            "https://accounts.google.com",
            "accounts.google.com",
        ];
        if (!validIssuers.includes(payload.iss)) {
            throw new Error("Invalid token issuer");
        }

        // 2. Audience validation (your app)
        if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
            throw new Error("Token not issued for this app");
        }

        // 3. Expiry check
        if (payload.exp * 1000 < Date.now()) {
            throw new Error("Token expired");
        }

        // 4. Email verification
        if (!payload.email_verified) {
            throw new Error("Email not verified by Google");
        }

        // 5. Subject (unique Google ID)
        if (!payload.sub) {
            throw new Error("Invalid Google user ID");
        }

        // ✅ Ownership confirmed
        return {
            googleId: payload.sub,
            email: payload.email?.toLowerCase() || null,
            name: payload.name || "",
            photo: payload.picture || null,
        };

    } catch (error) {
        console.error("Google Ownership Verification Failed:", error.message);

        throw new Error("Unauthorized Google token");
    }
};