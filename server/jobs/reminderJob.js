const cron = require("node-cron");
const db = require("../db");
const { sendReminderEmail } = require("../utils/sendReminderEmail");

function startReminderJob() {
  cron.schedule("*/5 * * * *", () => {
    db.query(
      `SELECT r.reminder_id, r.user_id, r.set_id, r.interval_hours, r.next_review_at,
              u.email, fs.title
       FROM set_review_reminder r
       JOIN users u ON r.user_id = u.user_id
       JOIN flashcard_set fs ON r.set_id = fs.set_id
       WHERE r.reminder_enabled = 1
         AND r.next_review_at <= NOW()`,
      async (err, results) => {
        if (err) {
          console.error("Reminder job DB error:", err.message);
          return;
        }

        for (const row of results) {
          try {
            await sendReminderEmail(row.email, row.title, row.set_id);

            db.query(
              `UPDATE set_review_reminder
               SET last_sent_at = NOW(),
                   next_review_at = DATE_ADD(NOW(), INTERVAL interval_hours HOUR)
               WHERE reminder_id = ?`,
              [row.reminder_id]
            );
          } catch (emailErr) {
            console.error("Reminder email error:", emailErr.message);
          }
        }
      }
    );
  });
}

module.exports = { startReminderJob };
