"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Ellipsis,
  MailX,
  PencilLine,
  Plus,
  Search,
  Shield,
  UserPlus,
  X
} from "lucide-react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/components/api";
import { useAuthStore } from "@/components/auth-store";
import { useDebouncedValue } from "@/components/use-debounced-value";

type ManagedUser = {
  id: string;
  msnv: string;
  fullName: string;
  isActive: boolean;
  preferredRole: "ADMIN" | "WRITER" | "VIEWER";
  status: "PENDING" | "LINKED" | "DISABLED";
  linkedUser: {
    id: string;
    email: string | null;
    avatarUrl: string | null;
    role: "ADMIN" | "WRITER" | "VIEWER";
  } | null;
};

type UserFilter = "ALL" | "PENDING" | "LINKED" | "ACTIVE" | "DISABLED";
type ManagedUsersResponse = {
  items: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: {
    total: number;
    linked: number;
    pending: number;
    disabled: number;
  };
};

type StatusBadgeProps = {
  user: ManagedUser;
};

type UserActionsDropdownProps = {
  user: ManagedUser;
  open: boolean;
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
  loading: boolean;
  error: string | null;
  onChangeName: (value: string) => void;
  onChangeMsnv: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

type UserDetailModalProps = {
  user: ManagedUser | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onChangeName: (value: string) => void;
  onToggleActive: () => void;
  onToggleCanPostAsUser: () => void;
  onUnlinkGmail: () => void;
  onSave: () => void;
};

const FILTERS: Array<{ key: UserFilter; label: string }> = [
  { key: "ALL", label: "Tất cả" },
  { key: "PENDING", label: "Chưa liên kết Gmail" },
  { key: "LINKED", label: "Đã liên kết Gmail" },
  { key: "ACTIVE", label: "Đang hoạt động" },
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

  if (user.linkedUser?.email) {
    return {
      text: "Đang hoạt động",
      className: "bg-emerald-50 text-emerald-600 border border-emerald-100"
    };
  }

  return {
    text: "Chưa liên kết",
    className: "bg-slate-100 text-slate-600 border border-slate-200"
  };
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
        active ? "bg-blue-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
      ].join(" ")}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function UserActionsDropdown({ user, open, onOpenChange, onView, onCompose, onUnlink, onToggleActive }: UserActionsDropdownProps) {
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
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50" onClick={() => { onOpenChange(false); onView(); }}>
            <PencilLine size={16} />
            <span>Xem / chỉnh sửa</span>
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            disabled={!user.linkedUser || !user.isActive}
            onClick={() => { onOpenChange(false); onCompose(); }}
          >
            <UserPlus size={16} />
            <span>Viết bài với user này</span>
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            disabled={!user.linkedUser?.email}
            onClick={() => { onOpenChange(false); onUnlink(); }}
          >
            <MailX size={16} />
            <span>Gỡ Gmail</span>
          </button>
          <button
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${user.isActive ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"}`}
            onClick={() => { onOpenChange(false); onToggleActive(); }}
          >
            {user.isActive ? <Ban size={16} /> : <CheckCircle2 size={16} />}
            <span>{user.isActive ? "Vô hiệu hóa" : "Kích hoạt lại"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function CreateUserModal({ open, name, msnv, loading, error, onChangeName, onChangeMsnv, onClose, onSubmit }: CreateUserModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/18 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto max-w-lg rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Tạo người dùng</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Khởi tạo hồ sơ nhân sự mới để chuẩn bị cho bước liên kết Gmail sau này.</p>
          </div>
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">Họ và tên</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white"
              value={name}
              onChange={(event) => onChangeName(event.target.value)}
              placeholder="Ví dụ: Nguyễn Văn A"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">Mã số nhân viên (MSNV)</label>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 uppercase text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white"
              value={msnv}
              onChange={(event) => onChangeMsnv(event.target.value.toUpperCase())}
              placeholder="Ví dụ: EMP0001"
            />
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-700">
            Gmail sẽ được liên kết khi nhân viên đăng nhập Google và nhập đúng mã số nhân viên.
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50" onClick={onClose}>
              Hủy
            </button>
            <button
              className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={loading || !name.trim() || !msnv.trim()}
              onClick={onSubmit}
            >
              {loading ? "Đang tạo..." : "Tạo người dùng"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserDetailModal({ user, loading, error, onClose, onChangeName, onToggleActive, onToggleCanPostAsUser, onUnlinkGmail, onSave }: UserDetailModalProps) {
  if (!user) return null;

  const canPostAsUser = user.preferredRole === "WRITER";

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/18 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto max-w-2xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between gap-4">
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

        <div className="space-y-6">
          <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Thông tin cơ bản</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-600">Họ và tên</label>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-300"
                  value={user.fullName}
                  onChange={(event) => onChangeName(event.target.value)}
                />
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-slate-600">Mã số nhân viên</div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{user.msnv}</div>
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-slate-600">Gmail</div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{user.linkedUser?.email || "Chưa liên kết Gmail"}</div>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Hành động tài khoản</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!user.linkedUser?.email}
                onClick={onUnlinkGmail}
              >
                <MailX size={16} className="text-red-600" />
                <span>Gỡ Gmail</span>
              </button>
              <button
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
                  user.isActive
                    ? "border-red-100 bg-red-50 text-red-600 hover:bg-red-100"
                    : "border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                }`}
                onClick={onToggleActive}
              >
                {user.isActive ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                <span>{user.isActive ? "Vô hiệu hóa tài khoản" : "Kích hoạt lại tài khoản"}</span>
              </button>

              <div className="rounded-2xl border border-slate-200 px-4 py-3 sm:col-span-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <PencilLine size={16} className="text-blue-600" />
                      <span className={canPostAsUser ? "" : "line-through text-slate-400"}>Viết bài với user này</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{canPostAsUser ? "Cho phép" : "Không cho phép"}</div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={canPostAsUser}
                    aria-label="Cho phép viết bài với user này"
                    onClick={onToggleCanPostAsUser}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${canPostAsUser ? "bg-blue-600" : "bg-slate-300"}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${canPostAsUser ? "translate-x-6" : "translate-x-1"}`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50" onClick={onClose}>
              Đóng
            </button>
            <button
              className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={loading}
              onClick={onSave}
            >
              {loading ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
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
  const { token, profile } = useAuthStore();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<UserFilter>("ALL");
  const [page, setPage] = useState(1);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createMsnv, setCreateMsnv] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const debouncedQuery = useDebouncedValue(query, 400);

  useEffect(() => {
    setPage(1);
  }, [activeFilter, debouncedQuery]);

  useEffect(() => {
    if (!token || !profile) return;
    if (profile.role !== "ADMIN") {
      router.replace("/");
    }
  }, [profile, router, token]);

  const usersQuery = useQuery({
    queryKey: ["admin-users", debouncedQuery, activeFilter, page],
    enabled: Boolean(token && profile?.role === "ADMIN"),
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
        msnv: createMsnv.trim().toUpperCase()
      }),
    onSuccess: async () => {
      setCreateName("");
      setCreateMsnv("");
      setCreateOpen(false);
      setCreateError(null);
      await invalidateUsers();
    },
    onError: (error) => {
      setCreateError(error instanceof Error ? error.message : "Không thể tạo người dùng");
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: (payload: { employeeId: string; fullName: string; isActive: boolean; preferredRole: ManagedUser["preferredRole"] }) =>
      apiRequest(`/admin/users/${payload.employeeId}`, token!, "PATCH", {
        fullName: payload.fullName,
        isActive: payload.isActive,
        preferredRole: payload.preferredRole
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

  const response = usersQuery.data;
  const users = response?.items ?? [];
  const stats = response?.stats ?? { total: 0, linked: 0, pending: 0, disabled: 0 };

  const openComposeAsUser = (user: ManagedUser) => {
    window.sessionStorage.setItem("admin_compose_target", JSON.stringify({ employeeId: user.id, fullName: user.fullName, msnv: user.msnv }));
    router.push(`/?composeAs=${user.id}`);
  };

  const unlinkGmail = async (user: ManagedUser) => {
    if (!token || !user.linkedUser?.email) return;
    if (!window.confirm("Bạn có chắc muốn gỡ Gmail khỏi tài khoản này?")) return;
    await unlinkGmailMutation.mutateAsync(user.id);
    if (selectedUser?.id === user.id) {
      setSelectedUser({ ...user, linkedUser: null });
    }
  };

  const toggleUserActive = async (user: ManagedUser) => {
    if (!token) return;
    await updateUserMutation.mutateAsync({
      employeeId: user.id,
      fullName: user.fullName,
      isActive: !user.isActive,
      preferredRole: user.preferredRole
    });
    setSelectedUser((prev) => (prev && prev.id === user.id ? { ...prev, isActive: !prev.isActive } : prev));
  };

  const handleSaveDetail = async () => {
    if (!selectedUser || !token) return;
    await updateUserMutation.mutateAsync({
      employeeId: selectedUser.id,
      fullName: selectedUser.fullName,
      isActive: selectedUser.isActive,
      preferredRole: selectedUser.preferredRole
    });
    setSelectedUser(null);
  };

  const handleToggleCanPostAsUser = async () => {
    if (!selectedUser || !token) return;

    const previousRole = selectedUser.preferredRole;
    const nextRole: ManagedUser["preferredRole"] = previousRole === "WRITER" ? "VIEWER" : "WRITER";
    setSelectedUser((prev) => (prev ? { ...prev, preferredRole: nextRole } : prev));
    setDetailError(null);

    try {
      await updateUserMutation.mutateAsync({
        employeeId: selectedUser.id,
        fullName: selectedUser.fullName,
        isActive: selectedUser.isActive,
        preferredRole: nextRole
      });
    } catch {
      setSelectedUser((prev) => (prev ? { ...prev, preferredRole: previousRole } : prev));
    }
  };

  if (!token || !profile || profile.role !== "ADMIN") {
    return null;
  }

  const rangeStart = response ? (response.page - 1) * response.pageSize + (users.length > 0 ? 1 : 0) : 0;
  const rangeEnd = response ? (response.page - 1) * response.pageSize + users.length : 0;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#EFF6FF_48%,#FFFFFF_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
              <Shield size={20} />
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">Quản lý người dùng</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Quản lý nhân sự nội bộ, liên kết Gmail và trạng thái tài khoản.</p>
          </div>

          <button
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            <Plus size={16} />
            <span>Tạo người dùng</span>
          </button>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Tổng người dùng</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{stats.total}</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Đã liên kết Gmail</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{stats.linked}</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Chưa liên kết</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{stats.pending}</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Vô hiệu hóa</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{stats.disabled}</div>
          </div>
        </div>

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.22)] sm:p-5 lg:p-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-blue-300 focus-within:bg-white">
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
                        <th className="px-5 py-4 font-medium">Trạng thái</th>
                        <th className="px-5 py-4 text-right font-medium">Hành động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/80" onClick={() => { setDetailError(null); setSelectedUser({ ...user }); }}>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                                {getInitials(user.fullName)}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900">{user.fullName}</div>
                                <div className="mt-0.5 text-xs text-slate-400">{user.preferredRole === "WRITER" ? "Có thể đăng bài" : "Chỉ xem"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-slate-600">{user.msnv}</td>
                          <td className="px-5 py-4 text-slate-600">{user.linkedUser?.email || <span className="text-slate-400">Chưa liên kết</span>}</td>
                          <td className="px-5 py-4">
                            <StatusBadge user={user} />
                          </td>
                          <td className="px-5 py-4 text-right" onClick={(event) => event.stopPropagation()}>
                            <UserActionsDropdown
                              user={user}
                              open={activeMenuId === user.id}
                              onOpenChange={(open) => setActiveMenuId(open ? user.id : null)}
                              onView={() => {
                                setDetailError(null);
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
                          <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                            Không có người dùng phù hợp với bộ lọc hiện tại.
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
        loading={createUserMutation.isPending}
        error={createError}
        onChangeName={setCreateName}
        onChangeMsnv={setCreateMsnv}
        onClose={() => setCreateOpen(false)}
        onSubmit={() => createUserMutation.mutate()}
      />

      <UserDetailModal
        user={selectedUser}
        loading={updateUserMutation.isPending || unlinkGmailMutation.isPending}
        error={detailError}
        onClose={() => setSelectedUser(null)}
        onChangeName={(value) => setSelectedUser((prev) => (prev ? { ...prev, fullName: value } : prev))}
        onToggleActive={() => selectedUser && void toggleUserActive(selectedUser)}
        onToggleCanPostAsUser={() => void handleToggleCanPostAsUser()}
        onUnlinkGmail={() => selectedUser && void unlinkGmail(selectedUser)}
        onSave={() => void handleSaveDetail()}
      />
    </main>
  );
}
