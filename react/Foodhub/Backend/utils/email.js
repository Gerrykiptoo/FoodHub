const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Email templates
const emailTemplates = {
  emailVerification: (data) => ({
    subject: 'Welcome to Foodhub - Verify Your Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
          <h1 style="color: #e74c3c; margin: 0;">Welcome to Foodhub!</h1>
        </div>
        <div style="padding: 30px 20px;">
          <h2>Hi ${data.name},</h2>
          <p>Thank you for joining Foodhub! We're excited to have you on board.</p>
          <p>To get started, please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.verificationUrl}" 
               style="background-color: #e74c3c; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${data.verificationUrl}</p>
          <p>This verification link will expire in 24 hours.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 14px;">
            If you didn't create an account with Foodhub, please ignore this email.
          </p>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px;">
          <p>© 2024 Foodhub. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  passwordReset: (data) => ({
    subject: 'Foodhub - Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
          <h1 style="color: #e74c3c; margin: 0;">Password Reset</h1>
        </div>
        <div style="padding: 30px 20px;">
          <h2>Hi ${data.name},</h2>
          <p>We received a request to reset your password for your Foodhub account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.resetUrl}" 
               style="background-color: #e74c3c; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${data.resetUrl}</p>
          <p><strong>This link will expire in 10 minutes for security reasons.</strong></p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 14px;">
            If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
          </p>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px;">
          <p>© 2024 Foodhub. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  orderConfirmation: (data) => ({
    subject: `Order Confirmation - ${data.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #27ae60; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Order Confirmed!</h1>
        </div>
        <div style="padding: 30px 20px;">
          <h2>Hi ${data.customerName},</h2>
          <p>Your order has been confirmed and is being prepared.</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Order Details</h3>
            <p><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p><strong>Restaurant:</strong> ${data.restaurantName}</p>
            <p><strong>Estimated Delivery:</strong> ${data.estimatedDeliveryTime}</p>
            <p><strong>Total:</strong> $${data.total}</p>
          </div>

          <h3>Items Ordered:</h3>
          <ul>
            ${data.items.map(item => `
              <li>${item.quantity}x ${item.name} - $${item.subtotal}</li>
            `).join('')}
          </ul>

          <p>You can track your order status in real-time through the Foodhub app.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.trackingUrl}" 
               style="background-color: #e74c3c; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Track Your Order
            </a>
          </div>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px;">
          <p>© 2024 Foodhub. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  orderDelivered: (data) => ({
    subject: `Order Delivered - ${data.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #27ae60; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Order Delivered!</h1>
        </div>
        <div style="padding: 30px 20px;">
          <h2>Hi ${data.customerName},</h2>
          <p>Your order has been successfully delivered. We hope you enjoy your meal!</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Order Summary</h3>
            <p><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p><strong>Restaurant:</strong> ${data.restaurantName}</p>
            <p><strong>Delivered At:</strong> ${data.deliveredAt}</p>
            <p><strong>Total:</strong> $${data.total}</p>
          </div>

          <p>How was your experience? We'd love to hear your feedback!</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.reviewUrl}" 
               style="background-color: #e74c3c; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Rate Your Order
            </a>
          </div>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px;">
          <p>© 2024 Foodhub. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  restaurantWelcome: (data) => ({
    subject: 'Welcome to Foodhub - Restaurant Partner',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #3498db; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Welcome to Foodhub!</h1>
        </div>
        <div style="padding: 30px 20px;">
          <h2>Hi ${data.restaurantName},</h2>
          <p>Welcome to the Foodhub family! We're excited to have you as a restaurant partner.</p>
          
          <p>Your restaurant registration has been received and is currently under review. Our team will verify your information and get back to you within 24-48 hours.</p>
          
          <h3>What's Next?</h3>
          <ul>
            <li>Complete your restaurant profile</li>
            <li>Add your menu items</li>
            <li>Set up your operating hours</li>
            <li>Configure delivery settings</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.dashboardUrl}" 
               style="background-color: #3498db; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Access Dashboard
            </a>
          </div>

          <p>If you have any questions, our support team is here to help!</p>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px;">
          <p>© 2024 Foodhub. All rights reserved.</p>
        </div>
      </div>
    `
  })
};

// Send email function
const sendEmail = async ({ to, subject, template, data, html, text }) => {
  try {
    const transporter = createTransporter();

    let emailContent = {};

    if (template && emailTemplates[template]) {
      emailContent = emailTemplates[template](data);
    } else if (html || text) {
      emailContent = { subject, html, text };
    } else {
      throw new Error('No email content provided');
    }

    const mailOptions = {
      from: `"Foodhub" <${process.env.EMAIL_USER}>`,
      to,
      subject: emailContent.subject || subject,
      html: emailContent.html,
      text: emailContent.text
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

// Send bulk emails
const sendBulkEmails = async (emails) => {
  const results = [];
  
  for (const email of emails) {
    try {
      const result = await sendEmail(email);
      results.push({ success: true, messageId: result.messageId, to: email.to });
    } catch (error) {
      results.push({ success: false, error: error.message, to: email.to });
    }
  }
  
  return results;
};

// Verify email configuration
const verifyEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('Email configuration verified successfully');
    return true;
  } catch (error) {
    console.error('Email configuration verification failed:', error);
    return false;
  }
};

module.exports = {
  sendEmail,
  sendBulkEmails,
  verifyEmailConfig,
  emailTemplates
};