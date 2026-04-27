"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { CircleAlert, FileText, Image as ImageIcon, LoaderCircle, Plus, X } from "lucide-react";
import { apiRequest } from "./api";

type UploadedMedia = {
  type: "IMAGE" | "VIDEO";
  url: string;
  publicId: string;
  thumbnailUrl?: string;
  thumbnailPublicId?: string;
  sizeBytes: number;
};

type LocalMedia = {
  file: File;
  thumbnailFile?: File;
  previewUrl: string;
  type: "IMAGE" | "VIDEO";
};

type ComposerBlock =
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "media"; media: LocalMedia; caption: string };

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

function createBlockId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
  if ("createImageBitmap" in window) return createImageBitmap(file);

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
  if (!ctx) throw new Error("Không thể xử lý ảnh trên trình duyệt này");

  ctx.drawImage(source, 0, 0, width, height);
  const targetType = supportsWebP() ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((result) => resolve(result), targetType, quality));

  if (!blob) throw new Error("Không thể nén ảnh");
  return blobToFile(blob, name, targetType);
}

async function processImageFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error(`Ảnh ${file.name} phải là JPG, PNG hoặc WebP`);
  if (file.size > MAX_IMAGE_SIZE) throw new Error(`Ảnh ${file.name} vượt quá 10MB`);

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

  if ("close" in image && typeof image.close === "function") image.close();
  return { mainFile, thumbnailFile };
}

function resizeTextarea(element: HTMLTextAreaElement) {
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

function getPlainContent(blocks: ComposerBlock[]) {
  return blocks
    .filter((block): block is Extract<ComposerBlock, { type: "paragraph" }> => block.type === "paragraph")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
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
  const [blocks, setBlocks] = useState<ComposerBlock[]>([{ id: createBlockId(), type: "paragraph", text: "" }]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    };
  }, []);

  if (!canPost) return null;

  const mediaCount = blocks.filter((block) => block.type === "media").length;
  const hasBody = blocks.some((block) => (block.type === "paragraph" ? block.text.trim() : true));

  const insertBlocksAfterActive = (newBlocks: ComposerBlock[]) => {
    setBlocks((prev) => {
      const anchorId = activeBlockId ?? prev[prev.length - 1]?.id;
      const index = prev.findIndex((block) => block.id === anchorId);
      if (index < 0) return [...prev, ...newBlocks];
      return [...prev.slice(0, index + 1), ...newBlocks, ...prev.slice(index + 1)];
    });
    setActiveBlockId(newBlocks[newBlocks.length - 1]?.id ?? null);
  };

  const addParagraph = () => {
    insertBlocksAfterActive([{ id: createBlockId(), type: "paragraph", text: "" }]);
  };

  const updateParagraph = (id: string, text: string) => {
    setBlocks((prev) => prev.map((block) => (block.id === id && block.type === "paragraph" ? { ...block, text } : block)));
  };

  const updateCaption = (id: string, caption: string) => {
    setBlocks((prev) => prev.map((block) => (block.id === id && block.type === "media" ? { ...block, caption } : block)));
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => {
      const found = prev.find((block) => block.id === id);
      if (found?.type === "media") {
        URL.revokeObjectURL(found.media.previewUrl);
        previewUrlsRef.current.delete(found.media.previewUrl);
      }

      const next = prev.filter((block) => block.id !== id);
      return next.length > 0 ? next : [{ id: createBlockId(), type: "paragraph", text: "" }];
    });
  };

  const onPickFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = Math.max(0, MAX_ATTACHMENTS - mediaCount);
    if (remainingSlots === 0) {
      setError(`Chỉ được đính kèm tối đa ${MAX_ATTACHMENTS} tệp.`);
      event.target.value = "";
      return;
    }

    setError(null);
    const picked = Array.from(files).slice(0, remainingSlots);
    const newBlocks: ComposerBlock[] = [];

    for (const rawFile of picked) {
      try {
        const isVideo = rawFile.type.startsWith("video");
        if (isVideo) {
          if (rawFile.size > MAX_VIDEO_SIZE) throw new Error(`Video ${rawFile.name} vượt quá 50MB`);
          const previewUrl = URL.createObjectURL(rawFile);
          previewUrlsRef.current.add(previewUrl);
          newBlocks.push({
            id: createBlockId(),
            type: "media",
            media: { file: rawFile, previewUrl, type: "VIDEO" },
            caption: ""
          });
          continue;
        }

        const { mainFile, thumbnailFile } = await processImageFile(rawFile);
        const previewUrl = URL.createObjectURL(mainFile);
        previewUrlsRef.current.add(previewUrl);
        newBlocks.push({
          id: createBlockId(),
          type: "media",
          media: { file: mainFile, thumbnailFile, previewUrl, type: "IMAGE" },
          caption: ""
        });
      } catch (processingError) {
        setError(processingError instanceof Error ? processingError.message : "Không thể xử lý ảnh");
      }
    }

    if (newBlocks.length > 0) insertBlocksAfterActive(newBlocks);
    event.target.value = "";
  };

  const uploadMediaBlocks = async (items: Extract<ComposerBlock, { type: "media" }>[]) => {
    const uploadedByBlockId = new Map<string, UploadedMedia>();
    if (items.length === 0) return uploadedByBlockId;

    const signature = await apiRequest<{
      cloudName: string;
      apiKey: string;
      folder: string;
      timestamp: number;
      signature: string;
    }>("/media/signature", token);

    const totalSteps = items.reduce((sum, item) => sum + (item.media.type === "IMAGE" ? 2 : 1), 0);
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
      if (item.media.type === "VIDEO") {
        const videoUpload = await uploadSingleFile(item.media.file, "video");
        uploadedByBlockId.set(item.id, {
          type: "VIDEO",
          url: videoUpload.secure_url,
          publicId: videoUpload.public_id,
          sizeBytes: item.media.file.size
        });
        continue;
      }

      const [mainUpload, thumbnailUpload] = await Promise.all([
        uploadSingleFile(item.media.file, "image"),
        uploadSingleFile(item.media.thumbnailFile ?? item.media.file, "image")
      ]);

      uploadedByBlockId.set(item.id, {
        type: "IMAGE",
        url: mainUpload.secure_url,
        publicId: mainUpload.public_id,
        thumbnailUrl: thumbnailUpload.secure_url,
        thumbnailPublicId: thumbnailUpload.public_id,
        sizeBytes: item.media.file.size
      });
    }

    return uploadedByBlockId;
  };

  const resetComposer = () => {
    setTitle("");
    setError(null);
    setUploadProgress(0);
    blocks.forEach((block) => {
      if (block.type === "media") {
        URL.revokeObjectURL(block.media.previewUrl);
        previewUrlsRef.current.delete(block.media.previewUrl);
      }
    });
    setBlocks([{ id: createBlockId(), type: "paragraph", text: "" }]);
    setActiveBlockId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closeComposer = () => {
    resetComposer();
    setOpen(false);
    onCloseCompose?.();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !hasBody) return;

    setError(null);
    setBusy(true);
    setUploadProgress(0);

    try {
      const cleanBlocks = blocks.filter((block) => (block.type === "paragraph" ? block.text.trim() : true));
      const mediaBlocks = cleanBlocks.filter((block): block is Extract<ComposerBlock, { type: "media" }> => block.type === "media");
      const uploadedByBlockId = await uploadMediaBlocks(mediaBlocks);
      const content = getPlainContent(cleanBlocks) || title.trim();

      const postBlocks = cleanBlocks.map((block) => {
        if (block.type === "paragraph") {
          return { id: block.id, type: "paragraph", text: block.text.trim() };
        }

        const uploaded = uploadedByBlockId.get(block.id);
        if (!uploaded) throw new Error("Upload media thất bại");

        if (uploaded.type === "VIDEO") {
          return {
            id: block.id,
            type: "video",
            url: uploaded.url,
            publicId: uploaded.publicId,
            caption: block.caption.trim() || undefined
          };
        }

        return {
          id: block.id,
          type: "image",
          url: uploaded.url,
          thumbnailUrl: uploaded.thumbnailUrl,
          publicId: uploaded.publicId,
          thumbnailPublicId: uploaded.thumbnailPublicId,
          caption: block.caption.trim() || undefined
        };
      });

      const media = postBlocks.flatMap((block, sortOrder) => {
        if (block.type === "paragraph") return [];

        return [{
          type: block.type === "video" ? "VIDEO" : "IMAGE",
          url: block.url,
          publicId: block.publicId,
          thumbnailUrl: block.type === "image" ? block.thumbnailUrl : undefined,
          thumbnailPublicId: block.type === "image" ? block.thumbnailPublicId : undefined,
          caption: block.caption,
          clientBlockId: block.id,
          sortOrder,
          sizeBytes: uploadedByBlockId.get(block.id)?.sizeBytes
        }];
      });

      const payload = { title: title.trim(), content, blocks: postBlocks, media };
      if (impersonateTarget) {
        await apiRequest(`/admin/posts/as-user/${impersonateTarget.employeeId}`, token, "POST", payload);
      } else {
        await apiRequest("/posts", token, "POST", payload);
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
          <button className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700" onClick={() => setOpen(true)}>
            Đăng
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/18 p-4 backdrop-blur-sm" onClick={closeComposer}>
          <form
            className="mx-auto max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-slate-200 bg-white text-slate-900 shadow-[0_35px_90px_-45px_rgba(15,23,42,0.32)]"
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
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

                  <div className="mt-3 space-y-3">
                    {blocks.map((block) => {
                      if (block.type === "paragraph") {
                        return (
                          <div key={block.id} className="group relative">
                            <textarea
                              rows={1}
                              className="w-full resize-none overflow-hidden bg-transparent text-base leading-7 text-slate-700 outline-none placeholder:text-slate-400"
                              placeholder="Nội dung bài viết"
                              value={block.text}
                              onFocus={() => setActiveBlockId(block.id)}
                              onChange={(event) => {
                                updateParagraph(block.id, event.target.value);
                                resizeTextarea(event.target);
                              }}
                              onInput={(event) => resizeTextarea(event.currentTarget)}
                            />
                            {blocks.length > 1 && !block.text.trim() && (
                              <button
                                type="button"
                                className="absolute right-0 top-0 hidden rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 group-hover:block"
                                onClick={() => removeBlock(block.id)}
                                aria-label="Xóa đoạn"
                              >
                                <X size={16} />
                              </button>
                            )}
                          </div>
                        );
                      }

                      return (
                        <figure key={block.id} className="group relative max-w-full rounded-[24px] border border-slate-200 bg-slate-50 p-2" onClick={() => setActiveBlockId(block.id)}>
                          <div className="relative overflow-hidden rounded-[20px] bg-slate-100">
                            {block.media.type === "IMAGE" ? (
                              <img src={block.media.previewUrl} alt="preview" className="max-h-[420px] w-full object-contain" draggable={false} />
                            ) : (
                              <video src={block.media.previewUrl} className="max-h-[420px] w-full object-contain" controls />
                            )}
                            <button
                              type="button"
                              onClick={() => removeBlock(block.id)}
                              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm transition hover:bg-white"
                              aria-label="Xóa media"
                            >
                              <X size={16} />
                            </button>
                          </div>
                          <input
                            className="mt-2 w-full rounded-2xl border border-transparent bg-transparent px-2 py-1 text-sm text-slate-500 outline-none transition placeholder:text-slate-400 focus:border-slate-200 focus:bg-white"
                            placeholder="Thêm chú thích ảnh..."
                            value={block.caption}
                            onChange={(event) => updateCaption(block.id, event.target.value)}
                          />
                        </figure>
                      );
                    })}
                  </div>

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
                    <button
                      type="button"
                      className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                      onClick={addParagraph}
                    >
                      <Plus size={18} />
                      Thêm đoạn
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
                  disabled={busy || !title.trim() || !hasBody}
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
