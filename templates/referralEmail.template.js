export function referralSummaryEmailTemplate({
    name,
    lifetimeCount,
    todayCount,
    date,
}) {
    return {
        subject: "Daily Referral Summary Report",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Referral Summary</title>
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      background-color: #f6f8fa;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 30px auto;
      background: #ffffff;
      padding: 24px;
      border-radius: 6px;
      border: 1px solid #e1e4e8;
    }
    h2 {
      margin-top: 0;
      color: #24292e;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
    }
    th, td {
      text-align: left;
      padding: 10px;
      border: 1px solid #e1e4e8;
    }
    th {
      background-color: #f6f8fa;
    }
    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: #6a737d;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>Referral Summary</h2>

    <p>Hello ${name},</p>

    <p>
      Below is your referral performance summary as of
      <strong>${date}</strong>.
    </p>

    <table>
      <tr>
        <th>Total Referrals (Lifetime)</th>
        <td>${lifetimeCount}</td>
      </tr>
      <tr>
        <th>Referrals Today</th>
        <td>${todayCount}</td>
      </tr>
    </table>

    <p>
      Continue sharing your referral code to increase your rewards.
    </p>

    <p>
      Regards,<br />
      <strong>Referral Program Team</strong>
    </p>

    <div class="footer">
      This is an automated message. Please do not reply.
    </div>
  </div>
</body>
</html>
`,
    };
}
