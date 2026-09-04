"use client";

import { useState } from "react";
import { forceUpdatePassword } from "@/app/(dashboard)/settings/account/actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ForcePasswordResetModal() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const result = await forceUpdatePassword(formData);
    
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Password updated successfully!");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border-zinc-800 bg-zinc-900">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle className="text-zinc-100">Welcome!</CardTitle>
            <CardDescription className="text-zinc-400">
              Please set a new, secure password to continue using your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-medium text-zinc-400">New Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm_password" className="text-xs font-medium text-zinc-400">Confirm Password</label>
              <input
                id="confirm_password"
                name="confirm_password"
                type="password"
                required
                minLength={6}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full bg-indigo-500 hover:bg-indigo-600 text-white" disabled={loading}>
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
