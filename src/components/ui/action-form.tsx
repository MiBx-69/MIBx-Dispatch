"use client";

import { useTransition, useRef, createContext, useContext } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface ActionFormContextType {
  isPending: boolean;
}

const ActionFormContext = createContext<ActionFormContextType>({ isPending: false });

export function useActionForm() {
  return useContext(ActionFormContext);
}

interface ActionFormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'action'> {
  action: (formData: FormData) => Promise<{ error?: string } | void | any>;
  successMessage?: string;
  onSuccess?: () => void;
}

export function ActionForm({ action, successMessage = "Success", onSuccess, children, ...props }: ActionFormProps) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const startTime = performance.now();

    startTransition(async () => {
      try {
        const result = await action(formData);
        const timeMs = Math.round(performance.now() - startTime);

        if (result?.error) {
          toast.error(result.error);
        } else {
          toast.success(`${successMessage} (in ${timeMs}ms)`);
          onSuccess?.();
        }
      } catch (err) {
        toast.error("An unexpected error occurred.");
      }
    });
  };

  return (
    <ActionFormContext.Provider value={{ isPending }}>
      <form ref={formRef} onSubmit={handleSubmit} {...props}>
        {children}
      </form>
    </ActionFormContext.Provider>
  );
}

export function SubmitButton({ 
  children, 
  className = "" 
}: { 
  children: React.ReactNode; 
  className?: string 
}) {
  const { isPending } = useActionForm();
  
  return (
    <button
      type="submit"
      disabled={isPending}
      className={`relative flex items-center justify-center transition-all ${className} ${
        isPending ? "opacity-70 cursor-not-allowed" : "active:scale-[0.98]"
      }`}
    >
      {isPending ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Processing...
        </>
      ) : (
        children
      )}
    </button>
  );
}
