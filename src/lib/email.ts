import nodemailer from "nodemailer";

export async function sendEmail(to: string, subject: string, html: string) {
  // Use standard SMTP environment variables, or fallback to the PATHAO username/password
  // if they happen to be a valid SMTP account (like Gmail)
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || "465");
  const secure = port === 465;
  const user = process.env.SMTP_USER || process.env.PATHAO_USERNAME || "";
  const pass = process.env.SMTP_PASS || process.env.PATHAO_PASSWORD || "";

  if (!user || !pass) {
    console.warn("No SMTP credentials found. Email will not be sent.");
    return false;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"MiBx Dispatch" <${user}>`,
      to,
      subject,
      html,
    });
    console.log("Message sent: %s", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}
