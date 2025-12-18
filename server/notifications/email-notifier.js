const nodemailer = require('nodemailer');
const { createLogger } = require('../utils/logger');

const logger = createLogger('EmailNotifier');

class EmailNotifier {
  constructor() {
    this.globalEnabled = process.env.EMAIL_ENABLED === 'true';
    this.from = process.env.EMAIL_FROM || 'noreply@amocrm-monitor.local';
    this.defaultRecipients = (process.env.EMAIL_TO || '').split(',').map((recipient) => recipient.trim()).filter(Boolean);
    this.smtpConfig = {
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };
    this.transporter = null;

    if (!this.globalEnabled && this.defaultRecipients.length === 0) {
      logger.info('Email notifications disabled (no default recipients)');
    } else {
      logger.info(`Email notifier ready (default recipients: ${this.defaultRecipients.length})`);
    }
  }

  getDefaultRecipients() {
    return [...this.defaultRecipients];
  }

  async sendDownNotification(checkType, errorMessage, options = {}) {
    const recipients = this._resolveRecipients(options.recipients);
    if (!recipients.length) {
      return;
    }
    if (!this._ensureTransporter()) {
      return;
    }

    const subject =
      options.subject ||
      `🔴 ${this._formatSubjectPrefix(options.clientLabel)}${checkType} is DOWN`;
    const html = this._getDownEmailHTML(checkType, errorMessage, options);

    await this._sendEmail({
      subject,
      html,
      to: recipients
    });
  }

  async sendUpNotification(checkType, downtime, options = {}) {
    const recipients = this._resolveRecipients(options.recipients);
    if (!recipients.length) {
      return;
    }
    if (!this._ensureTransporter()) {
      return;
    }

    const downtimeMinutes = Math.max(0, Math.floor((downtime || 0) / (1000 * 60)));
    const subject =
      options.subject ||
      `✅ ${this._formatSubjectPrefix(options.clientLabel)}${checkType} is back UP`;
    const html = this._getUpEmailHTML(checkType, downtimeMinutes, options);

    await this._sendEmail({
      subject,
      html,
      to: recipients
    });
  }

  _resolveRecipients(recipients) {
    if (Array.isArray(recipients) && recipients.length > 0) {
      return recipients.map((recipient) => recipient.trim()).filter(Boolean);
    }
    return this.defaultRecipients;
  }

  _formatSubjectPrefix(label) {
    return label ? `[${label}] ` : '';
  }

  _ensureTransporter() {
    if (this.transporter) {
      return true;
    }
    if (!this.smtpConfig.host) {
      logger.warn('SMTP host is not configured, skipping email send');
      return false;
    }
    this.transporter = nodemailer.createTransport(this.smtpConfig);
    return true;
  }

  async _sendEmail({ to, subject, html }) {
    if (!this.transporter) {
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: to.join(', '),
        subject,
        html
      });
      logger.info(`Email sent: ${subject}`);
    } catch (error) {
      logger.error('Failed to send email notification', {
        subject,
        error: error.message
      });
    }
  }

  _getDownEmailHTML(checkType, errorMessage, options = {}) {
    const clientLabel = options.clientLabel ? ` для ${options.clientLabel}` : '';
    const details = errorMessage || options.message || 'Service is not responding';
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc3545; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
    .footer { background: #e9ecef; padding: 15px; font-size: 12px; color: #6c757d; }
    .alert { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white !important; text-decoration: none; border-radius: 5px; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">🔴 Service DOWN Alert${clientLabel}</h2>
    </div>
    <div class="content">
      <h3>amoCRM ${checkType} check is DOWN</h3>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      <p><strong>Check Type:</strong> ${checkType}</p>
      ${
        details
          ? `<div class="alert"><strong>Error:</strong><br>${details}</div>`
          : ''
      }
      <p>The amoCRM API is currently experiencing issues. Please check the dashboard for more details.</p>
      <a href="${process.env.DASHBOARD_URL || 'http://localhost:5173'}" class="btn">View Dashboard</a>
    </div>
    <div class="footer">
      <p>amoCRM Health Monitor - Automated notification</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  _getUpEmailHTML(checkType, downtimeMinutes, options = {}) {
    const clientLabel = options.clientLabel ? ` для ${options.clientLabel}` : '';
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #28a745; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
    .footer { background: #e9ecef; padding: 15px; font-size: 12px; color: #6c757d; }
    .info { background: #d1ecf1; border: 1px solid #17a2b8; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white !important; text-decoration: none; border-radius: 5px; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">✅ Service Restored${clientLabel}</h2>
    </div>
    <div class="content">
      <h3>amoCRM ${checkType} check is back UP</h3>
      <p><strong>Restored At:</strong> ${new Date().toLocaleString()}</p>
      <p><strong>Check Type:</strong> ${checkType}</p>
      <div class="info">
        <strong>Downtime:</strong> ${downtimeMinutes} minute(s)
      </div>
      <p>The amoCRM API has recovered and is now operational.</p>
      <a href="${process.env.DASHBOARD_URL || 'http://localhost:5173'}" class="btn">View Dashboard</a>
    </div>
    <div class="footer">
      <p>amoCRM Health Monitor - Automated notification</p>
    </div>
  </div>
</body>
</html>
    `;
  }
}

module.exports = new EmailNotifier();
