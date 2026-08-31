import { createServiceClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { updateSMSSettings } from "./actions";
import { MessageSquare, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { TestSMSForm } from "./test-form";

export const metadata = { title: "SMS Settings" };

export default async function SMSSettingsPage() {
  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div>
        <Link href="/settings" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium mb-2 inline-block">
          &larr; Back to Settings
        </Link>
        <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-zinc-400" />
          SMS Notifications
        </h2>
        <p className="text-sm text-zinc-500 mt-1">Configure your sms.net.bd API key and automated messages.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden p-6 space-y-6">
        <ActionForm action={updateSMSSettings} successMessage="SMS Settings updated successfully" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">API Key</label>
              <input
                type="password"
                name="sms_api_key"
                defaultValue={settings?.sms_api_key || ""}
                placeholder="sms.net.bd API Key"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Sender ID</label>
              <input
                type="text"
                name="sms_sender_id"
                defaultValue={settings?.sms_sender_id || "UNIVERSES"}
                placeholder="e.g. UNIVERSES"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
              />
            </div>
          </div>

          <div className="border-t border-zinc-800/50 pt-6 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200">Automated Triggers</h3>
            
            {/* Order Created SMS */}
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/50 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-zinc-200">Order Placed</h4>
                  <p className="text-xs text-zinc-500">Sent automatically when a new order is received from Shopify.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="sms_auto_order_enabled" value="true" defaultChecked={settings?.sms_auto_order_enabled} className="sr-only peer" />
                  <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>
              <div>
                <textarea
                  name="sms_auto_order_template"
                  defaultValue={settings?.sms_auto_order_template || "প্রিয় {{customer_name}}, আমাদের ওয়েবসাইটে আপনি একটি অর্ডার প্লেস করেছেন (অর্ডার আইডি: {{order_id}})। অর্ডারটি কনফার্ম করতে আমাদের টিম খুব শীঘ্রই আপনাকে কল করবে। যেকোনো প্রয়োজনে আমাদের পেইজে যোগাযোগ করুন অথবা কল করুন 09643655867 নাম্বারে। ধন্যবাদ, Universes!"}
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
                  placeholder="Template for order confirmation..."
                />
                <p className="text-[10px] text-zinc-500 mt-1">Variables available: `&#123;&#123;order_id&#125;&#125;`, `&#123;&#123;customer_name&#125;&#125;`</p>
              </div>
            </div>

            {/* Dispatch SMS */}
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/50 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-zinc-200">Order Dispatched</h4>
                  <p className="text-xs text-zinc-500">Sent when order status changes to Dispatched.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="sms_auto_dispatch_enabled" value="true" defaultChecked={settings?.sms_auto_dispatch_enabled} className="sr-only peer" />
                  <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>
              <div>
                <textarea
                  name="sms_auto_dispatch_template"
                  defaultValue={settings?.sms_auto_dispatch_template || "প্রিয় {{customer_name}}, Universes থেকে আপনার অর্ডার {{order_id}} ডিসপ্যাচ করা হয়েছে। খুব শীঘ্রই আপনি প্রোডাক্টটি পেয়ে যাবেন। আপনার বকেয়া বিল {{total_price}} টাকা। প্রোডাক্টটি গ্রহণ করার জন্য অনুগ্রহ করে বিল প্রস্তুত রাখুন।"}
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
                  placeholder="Template for dispatch..."
                />
                <p className="text-[10px] text-zinc-500 mt-1">Variables available: `&#123;&#123;order_id&#125;&#125;`, `&#123;&#123;customer_name&#125;&#125;`, `&#123;&#123;tracking_url&#125;&#125;`, `&#123;&#123;total_price&#125;&#125;`</p>
              </div>
            </div>

            {/* Delivered SMS */}
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/50 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-zinc-200">Order Delivered</h4>
                  <p className="text-xs text-zinc-500">Sent when order status changes to Delivered.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="sms_auto_delivered_enabled" value="true" defaultChecked={settings?.sms_auto_delivered_enabled} className="sr-only peer" />
                  <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>
              <div>
                <textarea
                  name="sms_auto_delivered_template"
                  defaultValue={settings?.sms_auto_delivered_template || "প্রিয় {{customer_name}}, আপনার অর্ডার {{order_id}} সফলভাবে ডেলিভারি করা হয়েছে। Universes এর সাথে থাকার জন্য ধন্যবাদ! আমাদের সার্ভিস সম্পর্কে আপনার মতামত জানাতে ভুলবেন মস্তি করবেন না।"}
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
                  placeholder="Template for delivered..."
                />
                <p className="text-[10px] text-zinc-500 mt-1">Variables available: `&#123;&#123;order_id&#125;&#125;`, `&#123;&#123;customer_name&#125;&#125;`</p>
              </div>
            </div>

            {/* Cancelled SMS */}
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/50 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-zinc-200">Order Cancelled</h4>
                  <p className="text-xs text-zinc-500">Sent when an order is cancelled on Shopify.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="sms_auto_cancelled_enabled" value="true" defaultChecked={settings?.sms_auto_cancelled_enabled} className="sr-only peer" />
                  <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>
              <div>
                <textarea
                  name="sms_auto_cancelled_template"
                  defaultValue={settings?.sms_auto_cancelled_template || "প্রিয় {{customer_name}}, আপনার অর্ডার {{order_id}} বাতিল করা হয়েছে। যেকোনো প্রয়োজনে অনুগ্রহ করে আমাদের কল করুন 09643655867 নাম্বারে। ধন্যবাদ!"}
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
                  placeholder="Template for cancelled order..."
                />
                <p className="text-[10px] text-zinc-500 mt-1">Variables available: `&#123;&#123;order_id&#125;&#125;`, `&#123;&#123;customer_name&#125;&#125;`</p>
              </div>
            </div>

          </div>

          <div className="flex justify-end pt-4">
            <SubmitButton className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium">
              Save SMS Settings
            </SubmitButton>
          </div>
        </ActionForm>
      </div>
      
      <TestSMSForm />
    </div>
  );
}
