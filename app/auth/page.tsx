"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ReactElement } from "react";
import EnterCodeForm from "./enterCodeForm";
import { toast } from "sonner";
import { FiKey, FiMail } from "react-icons/fi";
import { requestLoginCode } from "@/services/auth.service";
import TextField from "@/app/ui/textField";
import AppButton from "@/app/ui/appButton";
import InlineStatus from "@/app/ui/inlineStatus";
import { FormStatus } from "@/app/ui/formStatus";

function validateEmail(rawEmail: string): string | undefined {
  const normalizedEmail = rawEmail.trim().toLowerCase();
  if (!normalizedEmail) {
    return "Email is required.";
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(normalizedEmail)) {
    return "Enter a valid email address.";
  }

  return undefined;
}

export default function AuthPage(): ReactElement {
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [status, setStatus] = useState<FormStatus | null>(null);

  const emailError = useMemo(() => {
    if (!hasAttemptedSubmit && !email.trim()) {
      return undefined;
    }

    return validateEmail(email);
  }, [email, hasAttemptedSubmit]);

  const handleEmailSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setHasAttemptedSubmit(true);
    const validationError = validateEmail(email);
    if (validationError) {
      setStatus({ tone: "error", message: validationError });
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await requestLoginCode(normalizedEmail);
      setEmail(normalizedEmail);
      setStatus({ tone: "success", message: "A one-time code is on the way." });
      setShowCodeInput(true);
      toast.success("Login code sent to your email");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to send login code right now.";
      setStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showCodeInput) {
    return (
      <section className="auth-card">
        <h1 className="icon-with-label">
          <FiKey aria-hidden="true" />
          <span>Enter your login code</span>
        </h1>
        <p className="auth-description">
          Enter the code sent to <strong>{email}</strong>.
        </p>
        <EnterCodeForm
          email={email}
          onBack={() => {
            setShowCodeInput(false);
            setHasAttemptedSubmit(false);
            setStatus({
              tone: "info",
              message: "Use another email to request a fresh code.",
            });
          }}
        />
      </section>
    );
  }

  return (
    <section className="auth-card">
      <h1 className="icon-with-label">
        <FiMail aria-hidden="true" />
        <span>Login</span>
      </h1>
      <p className="auth-description">
        We use one-time codes for secure login. Enter your email to continue.
      </p>
      <form
        onSubmit={handleEmailSubmit}
        className="form-stack"
      >
        <TextField
          id="email"
          type="email"
          value={email}
          label="Your email"
          placeholder="you@gmail.com"
          autoComplete="email"
          onChange={(event) => {
            setEmail(event.target.value);
            if (status?.tone === "error") {
              setStatus(null);
            }
          }}
          error={emailError}
          hint="We'll send a secure one-time code."
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
          loadingLabel="Sending code..."
          fullWidth
          startIcon={<FiMail aria-hidden="true" />}
        >
          Request login code
        </AppButton>
      </form>
    </section>
  );
}
