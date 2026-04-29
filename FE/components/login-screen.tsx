"use client";

import { CredentialResponse, GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import type { FormEvent } from "react";
import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { apiRequest } from "./api";
import { Profile, useAuthStore } from "./auth-store";
import { CompanyLogo } from "./company-logo";
import { ForgotPasswordModal } from "./forgot-password-modal";
import { GoogleLoginDeniedModal } from "./google-login-denied-modal";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const GOOGLE_LOGIN_DENIED_MESSAGE = "Bạn không có quyền đăng nhập qua Google. Vui lòng liên hệ với Ninh để được cấp tài khoản.";

type LoginScreenProps = {
  onLoggedIn?: () => void;
};

function LoginScreenContent({ onLoggedIn }: LoginScreenProps) {
  const { saveAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [loginMsnv, setLoginMsnv] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [googleLoginError, setGoogleLoginError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  const completeLogin = (token: string, profile: Profile) => {
    saveAuth(token, profile);
    onLoggedIn?.();
  };

  const handleGoogleLogin = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    setLoading(true);
    try {
      const response = await apiRequest<{ token: string; profile: Profile }>("/auth/google/callback", null, "POST", {
        idToken: credentialResponse.credential
      });
      completeLogin(response.token, response.profile);
    } catch (error) {
      setGoogleLoginError(error instanceof Error ? error.message : GOOGLE_LOGIN_DENIED_MESSAGE);
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setLoginError(null);
    try {
      const response = await apiRequest<{ token: string; profile: Profile }>("/auth/employee-login", null, "POST", {
        msnv: loginMsnv.trim().toUpperCase(),
        password: loginPassword
      });
      completeLogin(response.token, response.profile);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Không thể đăng nhập bằng MSNV");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <main className="grid min-h-screen place-items-center px-4 py-10">
        <section className="card w-full max-w-md p-7 text-center sm:p-8">
          <div className="flex justify-center">
            <CompanyLogo imageClassName="h-20 w-auto" />
          </div>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">Bản tin nội bộ</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">Đăng nhập bằng Google hoặc mã nhân viên để truy cập hệ thống truyền thông nội bộ.</p>

          <div className="mt-6 flex justify-center">
            <GoogleLogin onSuccess={handleGoogleLogin} onError={() => undefined} />
          </div>

          <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            hoặc
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form className="space-y-3 text-left" onSubmit={handleEmployeeLogin}>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Mã nhân viên</label>
              <input
                className="theme-primary-focus w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold uppercase text-slate-900 outline-none transition focus:bg-white"
                value={loginMsnv}
                onChange={(event) => setLoginMsnv(event.target.value.toUpperCase())}
                placeholder="VD: EMP0001"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Mật khẩu</label>
              <div className="theme-primary-focus flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:bg-white">
                <input
                  className="w-full bg-transparent text-sm text-slate-900 outline-none"
                  type={showPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="Mật khẩu được cấp"
                />
                <button
                  type="button"
                  className="ml-3 text-slate-400 transition hover:text-[color:var(--primary)]"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {loginError ? <p className="text-sm text-red-600">{loginError}</p> : null}

            <button
              className="btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading || !loginMsnv.trim() || !loginPassword}
            >
              <KeyRound size={16} />
              Đăng nhập bằng MSNV
            </button>
          </form>

          <button
            type="button"
            className="theme-primary-text mt-4 text-sm font-medium transition hover:underline"
            onClick={() => setForgotOpen(true)}
          >
            Quên mật khẩu?
          </button>

          {loading ? <p className="mt-4 text-sm text-slate-500">Đang xác thực...</p> : null}
        </section>
      </main>

      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} />
      <GoogleLoginDeniedModal
        open={Boolean(googleLoginError)}
        message={googleLoginError || GOOGLE_LOGIN_DENIED_MESSAGE}
        onClose={() => setGoogleLoginError(null)}
      />
    </>
  );
}

export function LoginScreen(props: LoginScreenProps) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <LoginScreenContent {...props} />
    </GoogleOAuthProvider>
  );
}
