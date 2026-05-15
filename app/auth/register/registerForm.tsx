"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FiCheckCircle } from "react-icons/fi";
import { acceptInvite } from "@/services/invite.service";
import TextField from "@/app/ui/textField";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import { FormStatus } from "@/app/ui/formStatus";

interface RegisterFormProps {
  token: string;
}

function validateName(rawName: string): string | undefined {
  const normalizedName = rawName.trim().replace(/\s+/g, " ");
  if (!normalizedName) {
    return "Full name is required.";
  }

  if (normalizedName.length < 2) {
    return "Full name must be at least 2 characters.";
  }

  return undefined;
}

export default function RegisterForm(props: RegisterFormProps): ReactElement {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [status, setStatus] = useState<FormStatus | null>(null);

  const nameError = useMemo(() => {
    if (!hasAttemptedSubmit && !name.trim()) {
      return undefined;
    }

    return validateName(name);
  }, [hasAttemptedSubmit, name]);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setHasAttemptedSubmit(true);

    const validationError = validateName(name);
    if (validationError) {
      setStatus({ tone: "error", message: validationError });
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const normalizedName = name.trim().replace(/\s+/g, " ");
      await acceptInvite({ token: props.token, name: normalizedName });
      setStatus({
        tone: "success",
        message: "Account setup complete. Redirecting to login.",
      });
      toast.success("Account setup complete. You can now login.");
      router.push("/auth");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to complete registration.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="form-stack"
    >
      <TextField
        id="name"
        type="text"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          if (status?.tone === "error") {
            setStatus(null);
          }
        }}
        label="Full name"
        placeholder="Your full name"
        autoComplete="name"
        error={nameError}
        hint="Use the full name you want to display in your workspace."
        disabled={isSubmitting}
        required
      />

      <InlineStatus
        tone={status?.tone ?? "info"}
        message={status?.message ?? null}
      />

      <AppButton
        type="submit"
        isLoading={isSubmitting}
        loadingLabel="Completing setup..."
        fullWidth
        startIcon={<FiCheckCircle aria-hidden="true" />}
      >
        Complete setup
      </AppButton>
    </form>
  );
}
