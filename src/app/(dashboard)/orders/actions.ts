"use server";

import { sendSMS } from "@/lib/sms";

export async function sendSMSAction(to: string, message: string) {
  try {
    const result = await sendSMS(to, message);
    if (!result.success) {
      throw new Error(result.message || "Failed to send SMS");
    }
    return { success: true };
  } catch (error: any) {
    console.error("sendSMSAction error:", error);
    return { success: false, error: error.message };
  }
}
