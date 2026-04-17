"use client";

import { FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { CircleAlert, FileText, Image as ImageIcon, LoaderCircle, X } from "lucide-react";
import { apiRequest } from "./api";

type UploadedMedia = {
  type: "IMAGE" | "VIDEO";
  url: string;
  publicId: string;
  thumbnailUrl?: string;
  thumbnailPublicId?: string;
  sizeBytes: number;
};

type LocalAttachment = {
  id: string;
  file: File;
  thumbnailFile?: File;
  previewUrl: string;
  type: "IMAGE" | "VIDEO";
};

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

const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;
const THUMBNAIL_WIDTH = 520;
const MAX_ATTACHMENTS = 5;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function supportsWebP() {
  const canvas = document.createElement("canvas");
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

async function blobToFile(blob: Blob, name: string, type: string) {
  const extension = type === "image/webp" ? "webp" : "jpg";
  const normalizedName = name.replace(/\.[^.]+$/, "");
  return new File([blob], `${normalizedName}.${extension}`, {
    type,
    lastModified: Date.now()
  });
}

async function loadImageBitmap(file: File) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Không thể đọc ảnh"));
      img.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderCanvasFile(source: CanvasImageSource, width: number, height: number, name: string, quality: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    throw new Error("Không thể xử lý ảnh trên trình duyệt này");
  }

  ctx.drawImage(source, 0, 0, width, height);
  const targetType = supportsWebP() ? "image/webp" : "image/jpeg";

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), targetType, quality);
  });

  if (!blob) {
    throw new Error("Không thể nén ảnh");
  }

  return blobToFile(blob, name, targetType);
}

async function processImageFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error(`Ảnh ${file.name} phải là JPG, PNG hoặc WebP`);
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error(`Ảnh ${file.name} vượt quá 10MB`);
  }

  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  const image = await loadImageBitmap(file);
  const sourceWidth = "width" in image ? image.width : 0;
  const sourceHeight = "height" in image ? image.height : 0;
  const mainRatio = Math.min(1, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
  const mainWidth = Math.max(1, Math.round(sourceWidth * mainRatio));
  const mainHeight = Math.max(1, Math.round(sourceHeight * mainRatio));
  const thumbRatio = Math.min(1, THUMBNAIL_WIDTH / sourceWidth);
  const thumbWidth = Math.max(1, Math.round(sourceWidth * thumbRatio));
  const thumbHeight = Math.max(1, Math.round(sourceHeight * thumbRatio));

  const [mainFile, thumbnailFile] = await Promise.all([
    renderCanvasFile(image, mainWidth, mainHeight, file.name, 0.82),
    renderCanvasFile(image, thumbWidth, thumbHeight, file.name.replace(/\.[^.]+$/, "-thumb"), 0.66)
  ]);

  if ("close" in image && typeof image.close === "function") {
    image.close();
  }

  return { mainFile, thumbnailFile };
}

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
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaStripRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({ active: false, startX: 0, startScrollLeft: 0, pointerId: -1 });

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    return () => {
      attachments.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [attachments]);

  useEffect(() => {
    const textarea = contentRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [content, open]);

  if (!canPost) return null;

  const resizeContent = (element: HTMLTextAreaElement) => {
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  };

  const stopMediaDrag = () => {
    const strip = mediaStripRef.current;
    if (strip && dragStateRef.current.pointerId >= 0 && strip.hasPointerCapture(dragStateRef.current.pointerId)) {
      strip.releasePointerCapture(dragStateRef.current.pointerId);
    }

    dragStateRef.current = {
      active: false,
      startX: 0,
      startScrollLeft: 0,
      pointerId: -1
    };
  };

  const handleMediaPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!mediaStripRef.current) return;

    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startScrollLeft: mediaStripRef.current.scrollLeft,
      pointerId: event.pointerId
    };

    mediaStripRef.current.setPointerCapture(event.pointerId);
  };

  const handleMediaPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active || !mediaStripRef.current) return;

    const delta = event.clientX - dragStateRef.current.startX;
    mediaStripRef.current.scrollLeft = dragStateRef.current.startScrollLeft - delta;
  };

  const onPickFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    if (remainingSlots === 0) {
      setError(`Chỉ được đính kèm tối đa ${MAX_ATTACHMENTS} tệp.`);
      event.target.value = "";
      return;
    }

    setError(null);
    const picked = Array.from(files).slice(0, remainingSlots);
    const newItems: LocalAttachment[] = [];

    for (const rawFile of picked) {
      try {
        const isVideo = rawFile.type.startsWith("video");

        if (isVideo) {
          if (rawFile.size > MAX_VIDEO_SIZE) {
            throw new Error(`Video ${rawFile.name} vượt quá 50MB`);
          }

          newItems.push({
            id: `${rawFile.name}-${rawFile.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            file: rawFile,
            previewUrl: URL.createObjectURL(rawFile),
            type: "VIDEO"
          });
          continue;
        }

        const { mainFile, thumbnailFile } = await processImageFile(rawFile);
        newItems.push({
          id: `${mainFile.name}-${mainFile.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          file: mainFile,
          thumbnailFile,
          previewUrl: URL.createObjectURL(mainFile),
          type: "IMAGE"
        });
      } catch (processingError) {
        setError(processingError instanceof Error ? processingError.message : "Không thể xử lý ảnh");
      }
    }

    if (newItems.length > 0) {
      setAttachments((prev) => [...prev, ...newItems]);
    }

    event.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const found = prev.find((item) => item.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const uploadFiles = async (items: LocalAttachment[]): Promise<UploadedMedia[]> => {
    if (items.length === 0) return [];

    const signature = await apiRequest<{
      cloudName: string;
      apiKey: string;
      folder: string;
      timestamp: number;
      signature: string;
    }>("/media/signature", token);

    const uploaded: UploadedMedia[] = [];
    const totalSteps = items.reduce((sum, item) => sum + (item.type === "IMAGE" ? 2 : 1), 0);
    let completedSteps = 0;

    const uploadSingleFile = async (file: File, resourceType: "image" | "video") => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", signature.apiKey);
      formData.append("timestamp", String(signature.timestamp));
      formData.append("folder", signature.folder);
      formData.append("signature", signature.signature);

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/${resourceType}/upload`, {
        method: "POST",
        body: formData
      });

      if (!uploadRes.ok) {
        const detail = await uploadRes.text().catch(() => "");
        throw new Error(detail || "Upload media thất bại");
      }

      completedSteps += 1;
      setUploadProgress(Math.round((completedSteps / totalSteps) * 100));
      return uploadRes.json();
    };

    for (const item of items) {
      if (item.type === "VIDEO") {
        const videoUpload = await uploadSingleFile(item.file, "video");
        uploaded.push({
          type: "VIDEO",
          url: videoUpload.secure_url,
          publicId: videoUpload.public_id,
          sizeBytes: item.file.size
        });
        continue;
      }

      const [mainUpload, thumbnailUpload] = await Promise.all([
        uploadSingleFile(item.file, "image"),
        uploadSingleFile(item.thumbnailFile ?? item.file, "image")
      ]);

      uploaded.push({
        type: "IMAGE",
        url: mainUpload.secure_url,
        publicId: mainUpload.public_id,
        thumbnailUrl: thumbnailUpload.secure_url,
        thumbnailPublicId: thumbnailUpload.public_id,
        sizeBytes: item.file.size
      });
    }

    return uploaded;
  };

  const resetComposer = () => {
    setTitle("");
    setContent("");
    setError(null);
    setUploadProgress(0);
    setAttachments((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closeComposer = () => {
    resetComposer();
    setOpen(false);
    onCloseCompose?.();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    setUploadProgress(0);

    try {
      const media = await uploadFiles(attachments);
      if (impersonateTarget) {
        await apiRequest(`/admin/posts/as-user/${impersonateTarget.employeeId}`, token, "POST", { title, content, media });
      } else {
        await apiRequest("/posts", token, "POST", { title, content, media });
      }
      closeComposer();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đăng bài");
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  };

  const showMaintenanceAlert = () => {
    window.alert("Tính năng đính kèm tài liệu đang được bảo trì.");
  };

  return (
    <>
      <div className="card mb-5 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
          {authorAvatarUrl ? (
            <img src={authorAvatarUrl} alt={authorLabel} className="h-11 w-11 rounded-full object-cover" />
          ) : (
            <div className="h-11 w-11 rounded-full bg-slate-200" />
          )}
          <button className="flex-1 text-left text-[15px] font-medium text-slate-400 transition hover:text-slate-500" onClick={() => setOpen(true)}>
            Chia sẻ thông tin mới với đồng nghiệp...
          </button>
          <button
            className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            onClick={() => setOpen(true)}
          >
            Đăng
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/18 p-4 backdrop-blur-sm" onClick={closeComposer}>
          <form
            className="mx-auto w-full max-w-3xl overflow-hidden rounded-[32px] border border-slate-200 bg-white text-slate-900 shadow-[0_35px_90px_-45px_rgba(15,23,42,0.32)]"
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="w-10" />
              <h2 className="text-2xl font-bold tracking-tight">Bài viết mới</h2>
              <button
                type="button"
                className="icon-btn h-10 w-10 rounded-full border border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                onClick={closeComposer}
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 sm:px-7">
              <div className="flex gap-4">
                <div className="flex w-11 shrink-0 flex-col items-center">
                  {authorAvatarUrl ? (
                    <img src={authorAvatarUrl} alt={authorLabel} className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-slate-200" />
                  )}
                  <div className="mt-3 h-full w-px bg-slate-200" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-lg font-bold text-slate-900">{impersonateTarget ? impersonateTarget.fullName : authorLabel}</div>
                  {impersonateTarget && <div className="mt-1 text-sm text-slate-500">MSNV: {impersonateTarget.msnv}</div>}

                  <input
                    className="mt-3 w-full bg-transparent text-[28px] font-bold tracking-tight text-slate-900 outline-none placeholder:text-slate-400"
                    placeholder="Nhập tiêu đề bài viết"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />

                  <textarea
                    ref={contentRef}
                    rows={1}
                    className="mt-3 w-full resize-none overflow-hidden bg-transparent text-base leading-7 text-slate-700 outline-none placeholder:text-slate-400"
                    placeholder="Nội dung bài viết"
                    value={content}
                    onChange={(event) => {
                      setContent(event.target.value);
                      resizeContent(event.target);
                    }}
                  />

                  {attachments.length > 0 && (
                    <div className="mt-2 max-w-full overflow-hidden">
                      <div
                        ref={mediaStripRef}
                        className="hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 pr-1 pt-1 [scrollbar-width:none] cursor-grab active:cursor-grabbing"
                        onPointerDown={handleMediaPointerDown}
                        onPointerMove={handleMediaPointerMove}
                        onPointerUp={stopMediaDrag}
                        onPointerCancel={stopMediaDrag}
                        onPointerLeave={stopMediaDrag}
                        style={{ touchAction: "pan-y pinch-zoom" }}
                      >
                        {attachments.map((item) => (
                          <div
                            key={item.id}
                            className="relative h-52 w-[min(20rem,72vw)] shrink-0 snap-start overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100"
                          >
                            {item.type === "IMAGE" ? (
                              <img src={item.previewUrl} alt="preview" className="h-full w-full object-cover" draggable={false} />
                            ) : (
                              <video src={item.previewUrl} className="h-full w-full object-cover" controls />
                            )}
                            <button
                              type="button"
                              onClick={() => removeAttachment(item.id)}
                              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm transition hover:bg-white"
                              aria-label="Xóa media"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      className="icon-btn flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                      onClick={() => fileInputRef.current?.click()}
                      title="Thêm ảnh hoặc video"
                    >
                      <ImageIcon size={20} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                      onClick={showMaintenanceAlert}
                      title="Đính kèm tài liệu"
                    >
                      <FileText size={20} />
                    </button>
                    <input
                      ref={fileInputRef}
                      name="media"
                      className="hidden"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,video/*"
                      onChange={onPickFiles}
                    />
                  </div>
                </div>
              </div>

              {busy && uploadProgress > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                    <LoaderCircle size={16} className="animate-spin" />
                    Đang tải tệp lên... {uploadProgress}%
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  <CircleAlert size={16} />
                  {error}
                </div>
              )}

              <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
                <button
                  type="submit"
                  disabled={busy || !title.trim() || !content.trim()}
                  className="rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {busy ? "Đang đăng..." : "Đăng"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
