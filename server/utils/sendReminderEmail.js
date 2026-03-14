const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendReminderEmail(to, setTitle, setId) {
  const practiceUrl = `http://localhost:3000/practice?set_id=${setId}`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject: "Time to review your flashcard set",
    text: `Hi,

It is time to review your flashcard set: ${setTitle}.

Open your app and continue studying here:
${practiceUrl}

Good luck!`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Time to review your flashcard set</h2>
        <p>It is time to review your flashcard set: <strong>${setTitle}</strong>.</p>
        <p>
          <a href="${practiceUrl}" style="display:inline-block;padding:10px 14px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;">
            Start Reviewing
          </a>
        </p>
        <p>Good luck!</p>
      </div>
    `,
  });
}

module.exports = { sendReminderEmail };
