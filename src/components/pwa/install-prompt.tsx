"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

export function InstallPWA() {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((err) => {
          console.error("Service Worker registration failed: ", err);
        });
      });
    }

    // 2. Check if already installed / standalone
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsStandalone(true);
      return;
    }

    // 3. Listen for the install prompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setSupportsPWA(true);
      setPromptInstall(e);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Also check if they previously dismissed it
    const dismissed = localStorage.getItem("pwa-prompt-dismissed");
    if (dismissed === "true") {
      setIsDismissed(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = () => {
    if (!promptInstall) {
      return;
    }
    promptInstall.prompt();
    promptInstall.userChoice.then((choiceResult: { outcome: string }) => {
      if (choiceResult.outcome === "accepted") {
        console.log("User accepted the A2HS prompt");
      } else {
        console.log("User dismissed the A2HS prompt");
      }
    });
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem("pwa-prompt-dismissed", "true");
  };

  if (!supportsPWA || isStandalone || isDismissed) {
    return null;
  }

  // Only show on mobile devices (roughly < 768px width)
  if (typeof window !== "undefined" && window.innerWidth > 768) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-zinc-900 border-t border-zinc-800 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] animate-slide-up-fade">
      <div className="flex items-start justify-between gap-4 max-w-md mx-auto">
        <div className="flex items-center gap-4">
          <img 
            src="/web-app-manifest-192x192.png" 
            alt="MiBx Dispatch Logo" 
            className="w-12 h-12 rounded-xl border border-zinc-700 shadow-md"
          />
          <div>
            <h3 className="text-white font-semibold leading-tight">MiBx Dispatch</h3>
            <p className="text-sm text-zinc-400 mt-0.5">Install the official mobile app</p>
          </div>
        </div>
        
        <button 
          onClick={handleDismiss}
          className="p-1.5 text-zinc-400 hover:text-white rounded-full bg-zinc-800"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-4 max-w-md mx-auto">
        <button
          onClick={handleInstall}
          className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-3 px-4 rounded-xl transition-all"
        >
          <Download className="w-5 h-5" />
          Install App
        </button>
      </div>
    </div>
  );
}
