const nodemailer = require('nodemailer');

/**
 * NotificationService
 * Handles email alerts for critical radiology findings.
 * Configure SMTP via environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Send a critical finding alert email.
 * @param {Object} radiologist - { name, email }
 * @param {Object} patient - { name, id }
 * @param {Array}  findings - Array of critical finding objects [{ condition, severity, description }]
 */
async function sendCriticalFindingAlert(radiologist, patient, findings) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[NotificationService] SMTP credentials not configured — skipping email alert.');
    return { skipped: true, reason: 'SMTP not configured' };
  }

  const transporter = createTransporter();

  const findingsList = Array.isArray(findings) && findings.length > 0
    ? findings.map((f) => `  • ${f.condition || f} (${f.severity || 'critical'}): ${f.description || ''}`).join('\n')
    : '  • Critical finding detected — please review immediately.';

  const subject = `[CRITICAL ALERT] Urgent Radiology Finding — Patient: ${patient.name || patient.id}`;

  const text = `
CRITICAL RADIOLOGY FINDING ALERT
==================================

Patient: ${patient.name || 'Unknown'} (ID: ${patient.id || 'N/A'})
Time: ${new Date().toISOString()}
Recipient: ${radiologist.name}

CRITICAL FINDINGS:
${findingsList}

REQUIRED ACTION: Immediate clinical review and patient notification.

---
This is an automated alert from the Radiology AI Assistant.
Do NOT reply to this email. Contact the on-call physician directly.
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; background:#f4f4f4; padding:20px;">
  <div style="background:#fff; border-left:6px solid #dc3545; padding:20px; max-width:600px; margin:auto; border-radius:4px;">
    <h2 style="color:#dc3545;">⚠ CRITICAL RADIOLOGY FINDING ALERT</h2>
    <table style="width:100%; border-collapse:collapse;">
      <tr><td style="padding:4px 8px;"><strong>Patient:</strong></td><td>${patient.name || 'Unknown'} (ID: ${patient.id || 'N/A'})</td></tr>
      <tr><td style="padding:4px 8px;"><strong>Time:</strong></td><td>${new Date().toLocaleString()}</td></tr>
      <tr><td style="padding:4px 8px;"><strong>Recipient:</strong></td><td>${radiologist.name}</td></tr>
    </table>
    <h3 style="color:#dc3545; margin-top:16px;">Critical Findings:</h3>
    <ul>
      ${Array.isArray(findings) && findings.length > 0
        ? findings.map((f) => `<li><strong>${f.condition || f}</strong> (${f.severity || 'critical'}): ${f.description || ''}</li>`).join('')
        : '<li>Critical finding detected — please review immediately.</li>'
      }
    </ul>
    <div style="background:#fff3cd; border:1px solid #ffc107; padding:12px; border-radius:4px; margin-top:16px;">
      <strong>Required Action:</strong> Immediate clinical review and patient notification.
    </div>
    <hr style="margin-top:20px;">
    <small style="color:#666;">This is an automated alert from the Radiology AI Assistant. Do not reply.</small>
  </div>
</body>
</html>
  `.trim();

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: radiologist.email,
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[NotificationService] Critical alert sent:', info.messageId);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[NotificationService] Failed to send alert:', err.message);
    throw err;
  }
}

/**
 * Send a general notification email.
 * @param {string} to - recipient email
 * @param {string} subject
 * @param {string} text - plain text body
 * @param {string} [html] - optional HTML body
 */
async function sendEmail(to, subject, text, html) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[NotificationService] SMTP credentials not configured — skipping email.');
    return { skipped: true };
  }

  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });

  return { sent: true, messageId: info.messageId };
}

module.exports = { sendCriticalFindingAlert, sendEmail };
