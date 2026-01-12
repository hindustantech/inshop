export function referralSummaryWhatsappTemplate({
    name,
    lifetimeCount,
    todayCount,
    date,
}) {
    return `
Hello ${name},

Referral Summary (${date})

Total Referrals: ${lifetimeCount}
Referrals Today: ${todayCount}

Keep sharing your referral code to earn more rewards.

— Referral Program Team
`;
}
