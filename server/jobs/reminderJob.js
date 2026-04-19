const cron = require("node-cron"); // Library for scheduling recurring background jobs using cron syntax
const db = require("../db"); // Shared MySQL database connection
const { sendReminderEmail } = require("../utils/sendReminderEmail"); // Helper that sends the actual reminder email

// Starts the reminder scheduler for set review emails.
// This function should be called when the server boots so reminders begin running.
function startReminderJob() {
  // Run the job every 5 minutes.
  // Cron pattern "*/5 * * * *" means:
  // every 5th minute, every hour, every day.
  cron.schedule("*/5 * * * *", () => {
    // Find all reminders that are:
    // - enabled
    // - due now or overdue
    //
    // The query also joins users and flashcard_set so the job has the email
    // address and set title needed for the reminder message.
    db.query(
      `SELECT r.reminder_id, r.user_id, r.set_id, r.interval_hours, r.next_review_at,
              u.email, fs.title
       FROM set_review_reminder r
       JOIN users u ON r.user_id = u.user_id
       JOIN flashcard_set fs ON r.set_id = fs.set_id
       WHERE r.reminder_enabled = 1
         AND r.next_review_at <= NOW()`,
      async (err, results) => {
        // If the database query fails, log the error and stop this run.
        if (err) {
          console.error("Reminder job DB error:", err.message);
          return;
        }

        // Process each due reminder one by one.
        for (const row of results) {
          try {
            // Send the reminder email to the user.
            // The helper receives:
            // - the user's email address
            // - the flashcard set title
            // - the set ID
            await sendReminderEmail(row.email, row.title, row.set_id);

            // After sending successfully, update the reminder record:
            // - last_sent_at becomes now
            // - next_review_at is moved forward by interval_hours
            db.query(
              `UPDATE set_review_reminder
               SET last_sent_at = NOW(),
                   next_review_at = DATE_ADD(NOW(), INTERVAL interval_hours HOUR)
               WHERE reminder_id = ?`,
              [row.reminder_id]
            );
          } catch (emailErr) {
            // If sending the email fails, log the error.
            // The reminder is not advanced in this case, so it can be retried later.
            console.error("Reminder email error:", emailErr.message);
          }
        }
      }
    );
  });
}

// Export the function so it can be started from elsewhere in the server code
module.exports = { startReminderJob };
