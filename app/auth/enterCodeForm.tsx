"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { FiArrowLeft, FiLogIn } from "react-icons/fi";
import { login } from "@/services/auth.service";
import TextField from "@/app/ui/textField";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import { FormStatus } from "@/app/ui/formStatus";

interface EnterCodeFormProps {
  email: string;
  onBack: () => void;
}

function validateCode(rawCode: string): string | undefined {
  const normalizedCode = rawCode.trim();
  if (!normalizedCode) {
    return "Login code is required.";
  }

  if (normalizedCode.length < 6) {
    return "Login code must be at least 6 characters.";
  }

  return undefined;
}

export default function EnterCodeForm(props: EnterCodeFormProps): ReactElement {
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [status, setStatus] = useState<FormStatus | null>(null);

  const codeError = useMemo(() => {
    if (!hasAttemptedSubmit && !code.trim()) {
      return undefined;
    }

    return validateCode(code);
  }, [code, hasAttemptedSubmit]);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setHasAttemptedSubmit(true);
    const validationError = validateCode(code);
    if (validationError) {
      setStatus({ tone: "error", message: validationError });
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      await login(props.email, code.trim());
      setStatus({ tone: "success", message: "You are now logged in." });
      toast.success("You are now logged in.");
      window.location.assign("/");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to login.";
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
        id="code"
        label="One-time code"
        type="text"
        value={code}
        placeholder="Enter your login code"
        autoComplete="one-time-code"
        onChange={(event) => {
          setCode(event.target.value);
          if (status?.tone === "error") {
            setStatus(null);
          }
        }}
        error={codeError}
        hint={`Code was sent to ${props.email}.`}
        disabled={isSubmitting}
        required
      />

      <InlineStatus
        tone={status?.tone ?? "info"}
        message={status?.message ?? null}
      />

      <div className="button-row">
        <AppButton
          type="submit"
          isLoading={isSubmitting}
          loadingLabel="Logging in..."
          fullWidth
          startIcon={<FiLogIn aria-hidden="true" />}
        >
          Login
        </AppButton>
        <AppButton
          type="button"
          variant="secondary"
          onClick={props.onBack}
          disabled={isSubmitting}
          startIcon={<FiArrowLeft aria-hidden="true" />}
        >
          Use different email
        </AppButton>
      </div>
    </form>
  );
}
