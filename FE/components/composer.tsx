"use client";

import { useEffect, useState } from "react";
import { PostEditorModal } from "./post-editor-modal";
import { Avatar } from "./post-shared";

type ComposerProps = {
  token: string;
  canPost: boolean;
  onCreated: () => void;
  openSignal?: number;
  authorLabel?: string;
  authorAvatarUrl?: string | null;
  impersonateTarget?: { employeeId: string; fullName: string; msnv: string } | null;
  onCloseCompose?: () => void;
};

export function Composer({
  token,
  canPost,
  onCreated,
  openSignal = 0,
  authorLabel = "Nhân viên nội bộ",
  authorAvatarUrl = null,
  impersonateTarget = null,
  onCloseCompose
}: ComposerProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  if (!canPost) return null;

  const closeComposer = () => {
    setOpen(false);
    onCloseCompose?.();
  };

  return (
    <>
      <div className="card mb-5 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
          <Avatar name={authorLabel} avatarUrl={authorAvatarUrl} size="h-11 w-11" />
          <button className="flex-1 text-left text-[15px] font-medium text-slate-400 transition hover:text-slate-500" onClick={() => setOpen(true)}>
            Chia sẻ thông tin mới với đồng nghiệp...
          </button>
          <button className="btn-primary px-5 py-2.5 text-sm" onClick={() => setOpen(true)}>
            Đăng
          </button>
        </div>
      </div>

      {open ? (
        <PostEditorModal
          mode="create"
          token={token}
          authorLabel={authorLabel}
          authorAvatarUrl={authorAvatarUrl}
          impersonateTarget={impersonateTarget}
          onClose={closeComposer}
          onSaved={onCreated}
        />
      ) : null}
    </>
  );
}
