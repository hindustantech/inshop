export function generateReferralCode() {
    const randomNum = Math.floor(100 + Math.random() * 900); // always 3 digits
    return `IND${randomNum}`;
}

export function isValidReferralCode(code) {
    const regex = /^IND\d{3}$/; // matches 3 digits after IND
    return regex.test(code);
}

// Example usage:
// const code = generateReferralCode();
