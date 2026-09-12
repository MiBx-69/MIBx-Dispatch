"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyCronUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
      <code className="flex-1 text-xs font-mono text-indigo-300 break-all">{url}</code>
      <button
        onClick={handleCopy}
        className="shrink-0 p-1.5 rounded-md hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-zinc-200"
        title="Copy URL"
      >
        {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
      </button>
    </div>
  );
}
