import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

export const sendOTPEmail = async (
  email: string,
  otp: string,
  username?: string
): Promise<void> => {
  const transporter = createTransporter();

  const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f4f4f4;
        }
        .container {
          background-color: #ffffff;
          border-radius: 12px;
          padding: 40px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          color: #10b981;
          margin-bottom: 10px;
        }
        .title {
          font-size: 24px;
          font-weight: 600;
          color: #1f232f;
          margin-bottom: 10px;
        }
        .content {
          margin-bottom: 30px;
        }
        .otp-container {
          background-color: #f0f9ff;
          border: 2px dashed #10b981;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          margin: 30px 0;
        }
        .otp-code {
          font-size: 32px;
          font-weight: bold;
          letter-spacing: 8px;
          color: #10b981;
          font-family: 'Courier New', monospace;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e4e6eb;
          font-size: 12px;
          color: #6b7280;
          text-align: center;
        }
        .warning {
          background-color: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 12px;
          margin: 20px 0;
          border-radius: 4px;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">🌱 Gardening Community</div>
          <div class="title">Verify Your Email</div>
        </div>
        
        <div class="content">
          <p>Hello${username ? ` ${username}` : ""},</p>
          
          <p>Thank you for joining our gardening community! To complete your registration, please verify your email address using the OTP code below:</p>
          
          <div class="otp-container">
            <div style="margin-bottom: 10px; color: #6b7280; font-size: 14px;">Your verification code:</div>
            <div class="otp-code">${otp}</div>
          </div>
          
          <p>This code will expire in <strong>10 minutes</strong>. If you didn't request this code, please ignore this email.</p>
          
          <div class="warning">
            <strong>⚠️ Security Notice:</strong> Never share this code with anyone. Our team will never ask for your verification code.
          </div>
        </div>
        
        <div class="footer">
          <p>If you have any questions, feel free to reach out to our support team.</p>
          <p style="margin-top: 10px;">© ${new Date().getFullYear()} Gardening Community. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Gardening Community" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Verify Your Email - Gardening Community",
    html: htmlTemplate,
    text: `Hello${username ? ` ${username}` : ""},\n\nYour verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`,
  };

  await transporter.sendMail(mailOptions);
};







