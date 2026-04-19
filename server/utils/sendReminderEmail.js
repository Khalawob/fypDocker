const nodemailer = require("nodemailer"); // Library used to send emails through an SMTP server

// Create a reusable SMTP transporter.
// This transporter is configured to use Brevo's SMTP relay service
// and authenticates using environment variables.
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com", // Brevo SMTP relay host
  port: 587, // Standard TLS-upgrade SMTP port
  secure: false, // false because port 587 uses STARTTLS rather than direct SSL/TLS
  auth: {
    user: process.env.EMAIL_USER, // SMTP username from environment variables
    pass: process.env.EMAIL_PASS, // SMTP password from environment variables
  },
});

// Sends a reminder email telling the user to review a specific flashcard set.
// Parameters:
// - to: recipient email address
// - setTitle: title of the flashcard set
// - setId: set ID used to build the practice page link
async function sendReminderEmail(to, setTitle, setId) {
  // Build the direct frontend URL that opens practice mode for this set.
  const practiceUrl = `http://localhost:3000/practice?set_id=${setId}`;

  // Send the email using both plain text and HTML versions.
  // Providing both improves compatibility with different email clients.
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER, // Sender address, falling back to EMAIL_USER if EMAIL_FROM is not set
    to, // Recipient email address
    subject: "Time to review your flashcard set", // Email subject line

    // Plain text version of the email for clients that do not render HTML
    text: `Hi,

It is time to review your flashcard set: ${setTitle}.

Open your app and continue studying here:
${practiceUrl}

Good luck!`,

    // HTML version of the email with a styled button link
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

// Export the helper so other files, such as the reminder cron job,
// can call it when reminder emails need to be sent.
module.exports = { sendReminderEmail };
