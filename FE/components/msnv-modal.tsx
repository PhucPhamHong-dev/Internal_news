"use client";

import { FormEvent, useState } from "react";

type MsnvModalProps = {
  onSubmit: (msnv: string) => Promise<void>;
  loading: boolean;
};

export function MsnvModal({ onSubmit, loading }: MsnvModalProps) {
  const [msnv, setMsnv] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit(msnv.trim().toUpperCase());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể liên kết MSNV";
      setError(message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/18 px-4 backdrop-blur-sm">
      <form className="card w-full max-w-md p-6 sm:p-7" onSubmit={handleSubmit}>
        <h2 className="text-2xl font-bold text-slate-900">Xác thực nhân sự</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Nhập mã số nhân viên để hoàn tất lần đăng nhập đầu tiên.</p>
        <input
          value={msnv}
          onChange={(event) => setMsnv(event.target.value)}
          className="theme-primary-focus mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white"
          placeholder="Ví dụ: EMP0001"
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="btn-primary mt-5 inline-flex w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Đang xử lý..." : "Liên kết MSNV"}
        </button>
      </form>
    </div>
  );
}
