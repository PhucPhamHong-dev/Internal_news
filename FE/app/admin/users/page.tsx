"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Ban, CheckCircle2, Ellipsis, KeyRound, MailX, PencilLine, Plus, Search, Shield, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/components/api";
import { ResetManagedPasswordModal } from "@/components/reset-managed-password-modal";
import { useAuthRedirect } from "@/components/use-auth-redirect";
import { useDebouncedValue } from "@/components/use-debounced-value";

type ManagedUser = {
  id: string;
  msnv: string;
  fullName: string;
  loginEmail: string | null;
  isActive: boolean;
  preferredRole: "ADMIN" | "HR_MANAGER" | "WRITER" | "VIEWER";
  canPost: boolean;
  canManageEmployees: boolean;
  roleSummary: string;
  status: "ACTIVE" | "INACTIVE" | "DISABLED";
  activatedAt: string | null;
  linkedUser: {
    id: string;
    email: string | null;
    avatarUrl: string | null;
    role: "ADMIN" | "HR_MANAGER" | "WRITER" | "VIEWER";
    canPost: boolean;
    canManageEmployees: boolean;
  } | null;
  temporaryPassword: string | null;
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
};

type UserFilter = "ALL" | "ACTIVE" | "INACTIVE" | "DISABLED";

type ManagedUsersResponse = {
  items: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: {
    total: number;
    active: number;
    inactive: number;
    disabled: number;
  };
};

type StatusBadgeProps = {
  user: ManagedUser;
};

type UserActionsDropdownProps = {
  user: ManagedUser;
  open: boolean;
  canComposeAsUser: boolean;
  canUnlinkGmail: boolean;
  onOpenChange: (open: boolean) => void;
  onView: () => void;
  onCompose: () => void;
  onUnlink: () => void;
  onToggleActive: () => void;
};

type CreateUserModalProps = {
  open: boolean;
  name: string;
  msnv: string;
  password: string;
  canPost: boolean;
  canManageEmployees: boolean;
  showPermissions: boolean;
  loading: boolean;
  error: string | null;
  onChangeName: (value: string) => void;
  onChangeMsnv: (value: string) => void;
  onChangePassword: (value: string) => void;
  onChangeCanPost: (value: boolean) => void;
  onChangeCanManageEmployees: (value: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
};

type UserDetailModalProps = {
  user: ManagedUser | null;
  loading: boolean;
  error: string | null;
  resetPasswordPreview: string | null;
  showPermissions: boolean;
  canManageGmail: boolean;
  canUnlinkGmail: boolean;
  onClose: () => void;
  onChangeName: (value: string) => void;
  onChangeLoginEmail: (value: string) => void;
  onChangeCanPost: (value: boolean) => void;
  onChangeCanManageEmployees: (value: boolean) => void;
  onToggleActive: () => void;
  onUnlinkGmail: () => void;
  onOpenResetPassword: () => void;
  onSave: () => void;
};

const FILTERS: Array<{ key: UserFilter; label: string }> = [
  { key: "ALL", label: "Tất cả" },
  { key: "ACTIVE", label: "Đang hoạt động" },
  { key: "INACTIVE", label: "Chưa hoạt động" },
  { key: "DISABLED", label: "Vô hiệu hóa" }
];

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "NV"
  );
}

function getStatusMeta(user: ManagedUser) {
  if (!user.isActive) {
    return {
      text: "Vô hiệu hóa",
      className: "bg-red-50 text-red-600 border border-red-100"
    };
  }

  if (user.activatedAt) {
    return {
      text: "Đang hoạt động",
      className: "bg-emerald-50 text-emerald-600 border border-emerald-100"
    };
  }

  return {
    text: "Chưa hoạt động",
    className: "bg-amber-50 text-amber-700 border border-amber-100"
  };
}

function getPermissionSummary(canPost: boolean, canManageEmployees: boolean) {
  if (canPost && canManageEmployees) return "Biên tập viên, Quản lý nhân sự";
  if (canPost) return "Biên tập viên";
  if (canManageEmployees) return "Quản lý nhân sự";
  return "Nhân viên";
}

function getPermissionNote(canPost: boolean, canManageEmployees: boolean) {
  if (canPost && canManageEmployees) return "Có thể đăng bài và quản lý nhân sự";
  if (canPost) return "Có thể tạo và quản lý bài viết bản tin";
  if (canManageEmployees) return "Có thể thêm, khóa và cấp lại mật khẩu cho nhân sự";
  return "Không có quyền đặc biệt";
}

function StatusBadge({ user }: StatusBadgeProps) {
  const status = getStatusMeta(user);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>{status.text}</span>;
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={[
        "rounded-full px-3.5 py-2 text-sm font-medium transition",
        active
          ? "theme-primary-bg text-white shadow-sm"
          : "theme-primary-border-hover border border-slate-200 bg-white text-slate-600 hover:bg-[color:var(--app-accent-faint)] hover:text-[color:var(--app-accent)]"
      ].join(" ")}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function PermissionSwitch({
  checked,
  disabled,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
        checked ? "theme-primary-bg" : "bg-slate-200"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function PermissionSection({
  canPost,
  canManageEmployees,
  onChangeCanPost,
  onChangeCanManageEmployees,
  disabled
}: {
  canPost: boolean;
  canManageEmployees: boolean;
  onChangeCanPost: (value: boolean) => void;
  onChangeCanManageEmployees: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Phân quyền</h3>
      <div className="mt-4 space-y-3">
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Được phép đăng bài</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">Có thể tạo và quản lý bài viết bản tin.</div>
          </div>
          <PermissionSwitch checked={canPost} disabled={disabled} onChange={onChangeCanPost} />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Được phép quản lý nhân viên</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">Có thể thêm, khóa và cấp lại mật khẩu cho nhân sự.</div>
          </div>
          <PermissionSwitch checked={canManageEmployees} disabled={disabled} onChange={onChangeCanManageEmployees} />
        </div>
      </div>
    </section>
  );
}

function UserActionsDropdown({ user, open, canComposeAsUser, canUnlinkGmail, onOpenChange, onView, onCompose, onUnlink, onToggleActive }: UserActionsDropdownProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onOpenChange]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open);
        }}
        aria-label="Mở thao tác"
      >
        <Ellipsis size={18} />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.25)]">
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
            onClick={() => {
              onOpenChange(false);
              onView();
            }}
          >
            <PencilLine size={16} />
            <span>Xem / chỉnh sửa</span>
          </button>

          {canComposeAsUser && (
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={!user.linkedUser || !user.isActive || !user.canPost}
              onClick={() => {
                onOpenChange(false);
                onCompose();
              }}
            >
              <UserPlus size={16} />
              <span>Viết bài với user này</span>
            </button>
          )}

          {canUnlinkGmail && (
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={!user.loginEmail}
              onClick={() => {
                onOpenChange(false);
                onUnlink();
              }}
            >
              <MailX size={16} />
              <span>Gỡ Gmail</span>
            </button>
          )}

          <button
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${user.isActive ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"}`}
            onClick={() => {
              onOpenChange(false);
              onToggleActive();
            }}
          >
            {user.isActive ? <Ban size={16} /> : <CheckCircle2 size={16} />}
            <span>{user.isActive ? "Vô hiệu hóa" : "Kích hoạt lại"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function CreateUserModal({
  open,
  name,
  msnv,
  password,
  canPost,
  canManageEmployees,
  showPermissions,
  loading,
  error,
  onChangeName,
  onChangeMsnv,
  onChangePassword,
  onChangeCanPost,
  onChangeCanManageEmployees,
  onClose,
  onSubmit
}: CreateUserModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/18 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto flex max-h-[90vh] max-w-lg flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Thêm nhân sự</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Khởi tạo hồ sơ nhân sự mới, cấp mật khẩu ban đầu và phân quyền sử dụng hệ thống.</p>
          </div>
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">Họ và tên</label>
            <input
              className="theme-primary-focus w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white"
              value={name}
              onChange={(event) => onChangeName(event.target.value)}
              placeholder="Ví dụ: Nguyễn Văn A"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">Mã số nhân viên (MSNV)</label>
            <input
              className="theme-primary-focus w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 uppercase text-slate-900 outline-none transition focus:bg-white"
              value={msnv}
              onChange={(event) => onChangeMsnv(event.target.value.toUpperCase())}
              placeholder="Ví dụ: EMP0001"
            />
          </div>

          {showPermissions && (
            <PermissionSection
              canPost={canPost}
              canManageEmployees={canManageEmployees}
              onChangeCanPost={onChangeCanPost}
              onChangeCanManageEmployees={onChangeCanManageEmployees}
            />
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">Mật khẩu cấp lần đầu (không bắt buộc)</label>
            <input
              className="theme-primary-focus w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:bg-white"
              type="text"
              value={password}
              onChange={(event) => onChangePassword(event.target.value)}
              placeholder="Bỏ trống để hệ thống tự tạo"
            />
          </div>

          <div className="theme-primary-soft theme-primary-border rounded-2xl border px-4 py-3 text-sm leading-6">
            Nhân sự có thể đăng nhập bằng MSNV và mật khẩu được cấp. Gmail đăng nhập Google có thể được cập nhật sau trong hồ sơ chi tiết.
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
            <button className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50" onClick={onClose}>
              Hủy
            </button>
            <button
              className="btn-primary px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-45"
              disabled={loading || !name.trim() || !msnv.trim()}
              onClick={onSubmit}
            >
              {loading ? "Đang tạo..." : "Thêm nhân sự"}
            </button>
        </div>
      </div>
    </div>
  );
}

function UserDetailModal({
  user,
  loading,
  error,
  resetPasswordPreview,
  showPermissions,
  canManageGmail,
  canUnlinkGmail,
  onClose,
  onChangeName,
  onChangeLoginEmail,
  onChangeCanPost,
  onChangeCanManageEmployees,
  onToggleActive,
  onUnlinkGmail,
  onOpenResetPassword,
  onSave
}: UserDetailModalProps) {
  if (!user) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/18 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto flex max-h-[90vh] max-w-2xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-base font-bold text-slate-700">
              {getInitials(user.fullName)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">{user.fullName}</h2>
                <StatusBadge user={user} />
              </div>
              <p className="mt-1 text-sm text-slate-500">MSNV: {user.msnv}</p>
            </div>
          </div>
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Thông tin cơ bản</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-600">Họ và tên</label>
                <input
                  className="theme-primary-focus w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition"
                  value={user.fullName}
                  onChange={(event) => onChangeName(event.target.value)}
                />
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-slate-600">Mã số nhân viên</div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{user.msnv}</div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">Gmail đăng nhập</label>
                <input
                  className="theme-primary-focus w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                  value={user.loginEmail ?? ""}
                  onChange={(event) => onChangeLoginEmail(event.target.value)}
                  placeholder="Nhập Gmail được phép đăng nhập"
                  disabled={!canManageGmail}
                />
              </div>
              
            </div>
          </section>

          {showPermissions ? (
            <PermissionSection
              canPost={user.canPost}
              canManageEmployees={user.canManageEmployees}
              onChangeCanPost={onChangeCanPost}
              onChangeCanManageEmployees={onChangeCanManageEmployees}
              disabled={loading}
            />
          ) : (
            <section className="rounded-[24px] border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Quyền hiện tại</h3>
              <div className="mt-3 text-sm font-semibold text-slate-900">{getPermissionSummary(user.canPost, user.canManageEmployees)}</div>
              <div className="mt-1 text-xs text-slate-500">{getPermissionNote(user.canPost, user.canManageEmployees)}</div>
            </section>
          )}

          <section className="rounded-[24px] border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Hành động tài khoản</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {canUnlinkGmail && (
                <button
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!user.loginEmail}
                  onClick={onUnlinkGmail}
                >
                  <MailX size={16} className="text-red-600" />
                  <span>Gỡ Gmail</span>
                </button>
              )}

              <button
                className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                onClick={onOpenResetPassword}
              >
                <KeyRound size={16} className="text-amber-600" />
                <span>Cấp lại mật khẩu</span>
              </button>

              <button
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
                  user.isActive ? "border-red-100 bg-red-50 text-red-600 hover:bg-red-100" : "border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                }`}
                onClick={onToggleActive}
              >
                {user.isActive ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                <span>{user.isActive ? "Vô hiệu hóa tài khoản" : "Kích hoạt lại tài khoản"}</span>
              </button>

              {resetPasswordPreview && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:col-span-2">
                  <div className="font-semibold">Cấp lại mật khẩu thành công.</div>
                  <div className="mt-2">
                    Mật khẩu tạm vừa đặt: <span className="font-bold">{resetPasswordPreview}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {error && <div className="text-sm text-red-600">{error}</div>}

        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
            <button className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50" onClick={onClose}>
              Đóng
            </button>
            <button
              className="btn-primary px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-45"
              disabled={loading}
              onClick={onSave}
            >
              {loading ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
        </div>
      </div>
    </div>
  );
}

function UsersTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200">
      <div className="space-y-0">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="grid animate-pulse grid-cols-[1.6fr_1fr_1.6fr_1fr_72px] gap-4 border-t border-slate-100 px-5 py-4 first:border-t-0">
            <div className="h-10 rounded-full bg-slate-100" />
            <div className="h-10 rounded-full bg-slate-100" />
            <div className="h-10 rounded-full bg-slate-100" />
            <div className="h-10 rounded-full bg-slate-100" />
            <div className="h-10 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token, profile, initialized, isAuthenticated } = useAuthRedirect({
    requirePermission: (currentProfile) => currentProfile.role === "ADMIN" || currentProfile.canManageEmployees
  });
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<UserFilter>("ALL");
  const [page, setPage] = useState(1);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createMsnv, setCreateMsnv] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createCanPost, setCreateCanPost] = useState(false);
  const [createCanManageEmployees, setCreateCanManageEmployees] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordDraft, setResetPasswordDraft] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [latestResetPassword, setLatestResetPassword] = useState<{ employeeId: string; password: string } | null>(null);

  const debouncedQuery = useDebouncedValue(query, 400);
  const canAccessUsers = profile?.role === "ADMIN" || profile?.canManageEmployees;
  const canComposeAsUser = profile?.role === "ADMIN";
  const canManagePermissions = profile?.role === "ADMIN";
  const canUnlinkGmail = profile?.role === "ADMIN";
  const canManageGmail = profile?.role === "ADMIN" || profile?.canManageEmployees;

  useEffect(() => {
    setPage(1);
  }, [activeFilter, debouncedQuery]);

  const usersQuery = useQuery({
    queryKey: ["admin-users", debouncedQuery, activeFilter, page],
    enabled: Boolean(token && canAccessUsers),
    queryFn: ({ signal }) =>
      apiRequest<ManagedUsersResponse>(
        `/admin/users?page=${page}&pageSize=10&q=${encodeURIComponent(debouncedQuery)}&filter=${activeFilter}`,
        token!,
        "GET",
        undefined,
        { signal }
      ),
    placeholderData: (previousData) => previousData
  });

  const invalidateUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const createUserMutation = useMutation({
    mutationFn: () =>
      apiRequest("/admin/users", token!, "POST", {
        fullName: createName.trim(),
        msnv: createMsnv.trim().toUpperCase(),
        initialPassword: createPassword.trim() || undefined,
        canPost: createCanPost,
        canManageEmployees: createCanManageEmployees
      }),
    onSuccess: async () => {
      setCreateName("");
      setCreateMsnv("");
      setCreatePassword("");
      setCreateCanPost(false);
      setCreateCanManageEmployees(false);
      setCreateOpen(false);
      setCreateError(null);
      await invalidateUsers();
    },
    onError: (error) => {
      setCreateError(error instanceof Error ? error.message : "Không thể thêm nhân sự");
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: (payload: { employeeId: string; fullName: string; isActive: boolean; canPost: boolean; canManageEmployees: boolean; loginEmail: string | null }) =>
      apiRequest(`/admin/users/${payload.employeeId}`, token!, "PATCH", {
        fullName: payload.fullName,
        isActive: payload.isActive,
        canPost: payload.canPost,
        canManageEmployees: payload.canManageEmployees,
        loginEmail: payload.loginEmail
      }),
    onSuccess: async () => {
      setDetailError(null);
      await invalidateUsers();
    },
    onError: (error) => {
      setDetailError(error instanceof Error ? error.message : "Không thể lưu thay đổi");
    }
  });

  const unlinkGmailMutation = useMutation({
    mutationFn: (employeeId: string) => apiRequest(`/admin/users/${employeeId}/unlink-gmail`, token!, "POST"),
    onSuccess: async () => {
      await invalidateUsers();
    },
    onError: (error) => {
      setDetailError(error instanceof Error ? error.message : "Không thể gỡ Gmail");
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (payload: { employeeId: string; newPassword: string }) =>
      apiRequest<ManagedUser>(`/admin/users/${payload.employeeId}/reset-password`, token!, "POST", { newPassword: payload.newPassword }),
    onSuccess: async (updated, variables) => {
      setSelectedUser(updated);
      setLatestResetPassword({ employeeId: variables.employeeId, password: variables.newPassword });
      setResetPasswordDraft("");
      setResetPasswordError(null);
      setResetPasswordOpen(false);
      await invalidateUsers();
    },
    onError: (error) => {
      setResetPasswordError(error instanceof Error ? error.message : "Không thể cấp lại mật khẩu");
    }
  });

  const response = usersQuery.data;
  const users = response?.items ?? [];
  const stats = response?.stats ?? { total: 0, active: 0, inactive: 0, disabled: 0 };

  const openComposeAsUser = (user: ManagedUser) => {
    window.sessionStorage.setItem("admin_compose_target", JSON.stringify({ employeeId: user.id, fullName: user.fullName, msnv: user.msnv }));
    router.push(`/?composeAs=${user.id}`);
  };

  const unlinkGmail = async (user: ManagedUser) => {
    if (!token || !user.loginEmail || !canUnlinkGmail) return;
    if (!window.confirm("Bạn có chắc muốn gỡ Gmail khỏi tài khoản này?")) return;
    await unlinkGmailMutation.mutateAsync(user.id);
    if (selectedUser?.id === user.id) {
      setSelectedUser({ ...user, loginEmail: null, linkedUser: user.linkedUser ? { ...user.linkedUser, email: null, avatarUrl: null } : null });
    }
  };

  const toggleUserActive = async (user: ManagedUser) => {
    if (!token) return;
    await updateUserMutation.mutateAsync({
      employeeId: user.id,
      fullName: user.fullName,
      isActive: !user.isActive,
      canPost: user.canPost,
      canManageEmployees: user.canManageEmployees,
      loginEmail: user.loginEmail
    });
    setSelectedUser((prev) => (prev && prev.id === user.id ? { ...prev, isActive: !prev.isActive } : prev));
  };

  const handleSaveDetail = async () => {
    if (!selectedUser || !token) return;
    const loginEmail = selectedUser.loginEmail?.trim().toLowerCase() || null;
    if (loginEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) {
      setDetailError("Gmail đăng nhập không đúng định dạng.");
      return;
    }

    await updateUserMutation.mutateAsync({
      employeeId: selectedUser.id,
      fullName: selectedUser.fullName,
      isActive: selectedUser.isActive,
      canPost: selectedUser.canPost,
      canManageEmployees: selectedUser.canManageEmployees,
      loginEmail
    });
    setSelectedUser(null);
  };

  const openResetPasswordModal = () => {
    setResetPasswordDraft("");
    setResetPasswordError(null);
    setResetPasswordOpen(true);
  };

  const submitResetPassword = async () => {
    if (!selectedUser) return;

    const password = resetPasswordDraft.trim();
    if (!password) {
      setResetPasswordError("Không được để trống mật khẩu.");
      return;
    }
    if (password.length < 6) {
      setResetPasswordError("Mật khẩu tạm thời phải có ít nhất 6 ký tự.");
      return;
    }

    setResetPasswordError(null);
    await resetPasswordMutation.mutateAsync({ employeeId: selectedUser.id, newPassword: password });
  };

  if (!initialized || !isAuthenticated || !token || !profile || !canAccessUsers) {
    return null;
  }

  const rangeStart = response ? (response.page - 1) * response.pageSize + (users.length > 0 ? 1 : 0) : 0;
  const rangeEnd = response ? (response.page - 1) * response.pageSize + users.length : 0;
  const resetPasswordPreview = latestResetPassword && latestResetPassword.employeeId === selectedUser?.id ? latestResetPassword.password : null;

  return (
    <main
      className="min-h-screen px-4 py-8 text-slate-900 sm:px-6 lg:px-8"
      style={{ background: "linear-gradient(180deg, #F8FAFC 0%, var(--app-accent-faint) 48%, #FFFFFF 100%)" }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <div className="theme-primary-text inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                <Shield size={18} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Quản lý nhân sự</h1>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">Quản lý hồ sơ nhân sự, phân quyền, Gmail đăng nhập và trạng thái tài khoản.</p>
          </div>

          <button
            className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-3 text-sm"
            onClick={() => {
              setCreateError(null);
              setCreateCanPost(false);
              setCreateCanManageEmployees(false);
              setCreateOpen(true);
            }}
          >
            <Plus size={16} />
            <span>Thêm nhân sự</span>
          </button>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Tổng nhân sự</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{stats.total}</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Đang hoạt động</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{stats.active}</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Chưa hoạt động</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{stats.inactive}</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Vô hiệu hóa</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{stats.disabled}</div>
          </div>
        </div>

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.22)] sm:p-5 lg:p-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="theme-primary-focus flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:bg-white">
              <Search size={18} className="text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo họ tên, MSNV hoặc Gmail"
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {FILTERS.map((filter) => (
                <FilterChip key={filter.key} label={filter.label} active={filter.key === activeFilter} onClick={() => setActiveFilter(filter.key)} />
              ))}
            </div>
          </div>

          {usersQuery.isLoading && !response ? (
            <UsersTableSkeleton />
          ) : (
            <>
              <div className="overflow-hidden rounded-[24px] border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-50/80 text-slate-500">
                      <tr>
                        <th className="px-5 py-4 font-medium">Họ tên</th>
                        <th className="px-5 py-4 font-medium">MSNV</th>
                        <th className="px-5 py-4 font-medium">Gmail</th>
                        <th className="px-5 py-4 font-medium">Quyền</th>
                        <th className="px-5 py-4 font-medium">Trạng thái</th>
                        <th className="px-5 py-4 text-right font-medium">Hành động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr
                          key={user.id}
                          className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/80"
                          onClick={() => {
                            setDetailError(null);
                            setLatestResetPassword(null);
                            setSelectedUser({ ...user });
                          }}
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                                {getInitials(user.fullName)}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900">{user.fullName}</div>
                                <div className="mt-0.5 text-xs text-slate-400">{getPermissionNote(user.canPost, user.canManageEmployees)}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-slate-600">{user.msnv}</td>
                          <td className="px-5 py-4 text-slate-600">{user.loginEmail || <span className="text-slate-400">Chưa cấp</span>}</td>
                          <td className="px-5 py-4 text-slate-600">{user.roleSummary || getPermissionSummary(user.canPost, user.canManageEmployees)}</td>
                          <td className="px-5 py-4">
                            <StatusBadge user={user} />
                          </td>
                          <td className="px-5 py-4 text-right" onClick={(event) => event.stopPropagation()}>
                            <UserActionsDropdown
                              user={user}
                              open={activeMenuId === user.id}
                              canComposeAsUser={Boolean(canComposeAsUser)}
                              canUnlinkGmail={Boolean(canUnlinkGmail)}
                              onOpenChange={(open) => setActiveMenuId(open ? user.id : null)}
                              onView={() => {
                                setDetailError(null);
                                setLatestResetPassword(null);
                                setSelectedUser({ ...user });
                              }}
                              onCompose={() => openComposeAsUser(user)}
                              onUnlink={() => void unlinkGmail(user)}
                              onToggleActive={() => void toggleUserActive(user)}
                            />
                          </td>
                        </tr>
                      ))}

                      {users.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">
                            Không có nhân sự phù hợp với bộ lọc hiện tại.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Hiển thị {rangeStart} - {rangeEnd} / {response?.total ?? 0}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    className="rounded-2xl border border-slate-200 px-4 py-2 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={page <= 1 || usersQuery.isFetching}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Trước
                  </button>
                  <span className="rounded-2xl bg-slate-100 px-4 py-2 text-slate-600">
                    Trang {response?.page ?? page}/{response?.totalPages ?? 1}
                  </span>
                  <button
                    className="rounded-2xl border border-slate-200 px-4 py-2 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={(response?.page ?? page) >= (response?.totalPages ?? 1) || usersQuery.isFetching}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Sau
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <CreateUserModal
        open={createOpen}
        name={createName}
        msnv={createMsnv}
        password={createPassword}
        canPost={createCanPost}
        canManageEmployees={createCanManageEmployees}
        showPermissions={Boolean(canManagePermissions)}
        loading={createUserMutation.isPending}
        error={createError}
        onChangeName={setCreateName}
        onChangeMsnv={setCreateMsnv}
        onChangePassword={setCreatePassword}
        onChangeCanPost={setCreateCanPost}
        onChangeCanManageEmployees={setCreateCanManageEmployees}
        onClose={() => setCreateOpen(false)}
        onSubmit={() => createUserMutation.mutate()}
      />

      <UserDetailModal
        user={selectedUser}
        loading={updateUserMutation.isPending || unlinkGmailMutation.isPending || resetPasswordMutation.isPending}
        error={detailError}
        resetPasswordPreview={resetPasswordPreview}
        showPermissions={Boolean(canManagePermissions)}
        canManageGmail={Boolean(canManageGmail)}
        canUnlinkGmail={Boolean(canUnlinkGmail)}
        onClose={() => {
          setLatestResetPassword(null);
          setSelectedUser(null);
        }}
        onChangeName={(value) => setSelectedUser((prev) => (prev ? { ...prev, fullName: value } : prev))}
        onChangeLoginEmail={(value) => setSelectedUser((prev) => (prev ? { ...prev, loginEmail: value } : prev))}
        onChangeCanPost={(value) => setSelectedUser((prev) => (prev ? { ...prev, canPost: value, roleSummary: getPermissionSummary(value, prev.canManageEmployees) } : prev))}
        onChangeCanManageEmployees={(value) =>
          setSelectedUser((prev) => (prev ? { ...prev, canManageEmployees: value, roleSummary: getPermissionSummary(prev.canPost, value) } : prev))
        }
        onToggleActive={() => selectedUser && void toggleUserActive(selectedUser)}
        onUnlinkGmail={() => selectedUser && void unlinkGmail(selectedUser)}
        onOpenResetPassword={openResetPasswordModal}
        onSave={() => void handleSaveDetail()}
      />

      <ResetManagedPasswordModal
        open={resetPasswordOpen}
        employeeName={selectedUser?.fullName ?? ""}
        password={resetPasswordDraft}
        loading={resetPasswordMutation.isPending}
        error={resetPasswordError}
        onChangePassword={setResetPasswordDraft}
        onClose={() => setResetPasswordOpen(false)}
        onSubmit={() => void submitResetPassword()}
      />
    </main>
  );
}
