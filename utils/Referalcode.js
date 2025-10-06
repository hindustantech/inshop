export function generateReferralCode() {
    const randomNum = Math.floor(100000 + Math.random() * 900000); // always 6 digits
    return `IN${randomNum}`;
}

export function isValidReferralCode(code) {
    const regex = /^IND\d{4}$/;
    return regex.test(code);
}

// Example usage:
// const code = generateReferralCode();
// console.log(code); // e.g., IN123456
// console.log(isValidReferralCode(code)); // true
// console.log(isValidReferralCode('XX123456')); // false