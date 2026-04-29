"use client";

import { ChangeEvent, ClipboardEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, FileText, Heading2, Image as ImageIcon, LoaderCircle, Minus, Pilcrow, Quote, Type, Video, X } from "lucide-react";
import { apiRequest } from "./api";
import { FeedPost } from "./post-shared";

type UploadedMedia = {
  type: "IMAGE" | "VIDEO";
  url: string;
  publicId: string;
  thumbnailUrl?: string;
  thumbnailPublicId?: string;
  sizeBytes: number;
};

type LocalMedia = {
  kind: "local";
  file: File;
  thumbnailFile?: File;
  previewUrl: string;
  type: "IMAGE" | "VIDEO";
};

type RemoteMedia = {
  kind: "remote";
  url: string;
  type: "IMAGE" | "VIDEO";
  publicId: string;
  thumbnailUrl?: string | null;
  thumbnailPublicId?: string | null;
};

type EditorTextBlock = {
  id: string;
  type: "paragraph" | "heading" | "quote";
  text: string;
};

type EditorDividerBlock = {
  id: string;
  type: "divider";
};

type EditorMediaBlock = {
  id: string;
  type: "image" | "video";
  caption: string;
  media: LocalMedia | RemoteMedia;
};

type EditorBlock = EditorTextBlock | EditorDividerBlock | EditorMediaBlock;

export type EditablePost = Omit<FeedPost, "media"> & {
  media: Array<
    FeedPost["media"][number] & {
      publicId?: string;
      thumbnailPublicId?: string | null;
      clientBlockId?: string | null;
      sortOrder?: number | null;
    }
  >;
};

type CreateModeProps = {
  mode: "create";
  token: string;
  onSaved: () => void;
  onClose: () => void;
  authorLabel: string;
  authorAvatarUrl?: string | null;
  impersonateTarget?: { employeeId: string; fullName: string; msnv: string } | null;
};

type EditModeProps = {
  mode: "edit";
  token: string;
  onSaved: () => void;
  onClose: () => void;
  post: EditablePost | null;
  loading?: boolean;
  loadError?: string | null;
};

type PostEditorModalProps = CreateModeProps | EditModeProps;

const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;
const THUMBNAIL_WIDTH = 520;
const MAX_ATTACHMENTS = 10;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"]);

function createBlockId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createTextBlock(type: EditorTextBlock["type"] = "paragraph", text = ""): EditorTextBlock {
  return { id: createBlockId(), type, text };
}

function createDividerBlock(): EditorDividerBlock {
  return { id: createBlockId(), type: "divider" };
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

function resizeTextarea(element: HTMLTextAreaElement, minHeight = 120) {
  element.style.height = "0px";
  element.style.height = `${Math.max(minHeight, element.scrollHeight)}px`;
}

function isTextBlock(block: EditorBlock): block is EditorTextBlock {
  return block.type === "paragraph" || block.type === "heading" || block.type === "quote";
}

function getPlainContent(blocks: EditorBlock[]) {
  return blocks
    .filter(isTextBlock)
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function hasMeaningfulBody(blocks: EditorBlock[]) {
  return blocks.some((block) => {
    if (block.type === "image" || block.type === "video") return true;
    if (block.type === "divider") return false;
    return isTextBlock(block) && block.text.trim().length > 0;
  });
}

function createRemoteMediaBlock(type: "image" | "video", media: NonNullable<EditablePost["media"]>[number], fallbackId?: string): EditorMediaBlock | null {
  if (!media.publicId) return null;
  return {
    id: fallbackId ?? media.clientBlockId ?? createBlockId(),
    type,
    caption: media.caption ?? "",
    media: {
      kind: "remote",
      type: type === "image" ? "IMAGE" : "VIDEO",
      url: media.url,
      publicId: media.publicId,
      thumbnailUrl: media.thumbnailUrl ?? null,
      thumbnailPublicId: media.thumbnailPublicId ?? null
    }
  };
}

function buildInitialBlocks(post?: EditablePost | null) {
  if (!post) return [createTextBlock()];
  if (post.blocks && post.blocks.length > 0) {
    const built = post.blocks
      .map((block) => {
        if (block.type === "paragraph" || block.type === "heading" || block.type === "quote") return { id: block.id, type: block.type, text: block.text } as EditorTextBlock;
        if (block.type === "divider") return { id: block.id, type: "divider" } as EditorDividerBlock;
        const matchedMedia = post.media.find((item) => item.clientBlockId === block.id || item.url === block.url);
        if (!matchedMedia) return null;
        return createRemoteMediaBlock(block.type, matchedMedia, block.id);
      })
      .filter((block): block is EditorBlock => Boolean(block));
    return built.length > 0 ? built : [createTextBlock("paragraph", post.content)];
  }

  const fallback: EditorBlock[] = [];
  if (post.content.trim()) fallback.push(createTextBlock("paragraph", post.content));
  post.media.forEach((item) => {
    const block = item.type === "IMAGE" ? createRemoteMediaBlock("image", item, item.clientBlockId ?? item.id) : createRemoteMediaBlock("video", item, item.clientBlockId ?? item.id);
    if (block) fallback.push(block);
  });
  return fallback.length > 0 ? fallback : [createTextBlock()];
}

function blockTypeLabel(type: EditorTextBlock["type"]) {
  if (type === "heading") return "Tiêu đề phụ";
  if (type === "quote") return "Trích dẫn";
  return "Văn bản";
}

function textPlaceholder(type: EditorTextBlock["type"]) {
  if (type === "heading") return "Nhập tiêu đề phụ";
  if (type === "quote") return "Nhập đoạn trích dẫn";
  return "Nhập nội dung bài viết...";
}

export function PostEditorModal(props: PostEditorModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const textRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const editSourcePost = props.mode === "edit" ? props.post : null;
  const [title, setTitle] = useState(props.mode === "edit" ? editSourcePost?.title ?? "" : "");
  const [blocks, setBlocks] = useState<EditorBlock[]>(props.mode === "edit" ? buildInitialBlocks(editSourcePost) : [createTextBlock()]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const modeLabel = props.mode === "edit" ? "Sửa bài viết" : "Bài viết mới";
  const actionLabel = props.mode === "edit" ? "Lưu thay đổi" : "Đăng bài";
  const hasBody = useMemo(() => hasMeaningfulBody(blocks), [blocks]);
  const mediaCount = useMemo(() => blocks.filter((block) => block.type === "image" || block.type === "video").length, [blocks]);

  useEffect(() => {
    if (props.mode !== "edit") return;
    setTitle(editSourcePost?.title ?? "");
    setBlocks(buildInitialBlocks(editSourcePost));
    setActiveBlockId(null);
    setError(null);
    setUploadProgress(0);
  }, [editSourcePost, props.mode]);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!activeBlockId) return;
    const target = textRefs.current[activeBlockId];
    if (target) {
      target.focus();
      const length = target.value.length;
      target.setSelectionRange(length, length);
      resizeTextarea(target, target.dataset.variant === "heading" ? 72 : 240);
    }
  }, [activeBlockId, blocks]);

  const cleanupBlock = (block: EditorBlock) => {
    if ((block.type === "image" || block.type === "video") && block.media.kind === "local") {
      URL.revokeObjectURL(block.media.previewUrl);
      previewUrlsRef.current.delete(block.media.previewUrl);
    }
  };

  const updateTextBlock = (id: string, updater: Partial<EditorTextBlock>) => {
    setBlocks((current) => current.map((block) => (block.id === id && isTextBlock(block) ? { ...block, ...updater } : block)));
  };

  const updateMediaCaption = (id: string, caption: string) => {
    setBlocks((current) => current.map((block) => (block.id === id && (block.type === "image" || block.type === "video") ? { ...block, caption } : block)));
  };

  const removeBlock = (id: string) => {
    setBlocks((current) => {
      const found = current.find((block) => block.id === id);
      if (found) cleanupBlock(found);
      const next = current.filter((block) => block.id !== id);
      return next.length > 0 ? next : [createTextBlock()];
    });
  };

  const insertBlocksAfterActive = (newBlocks: EditorBlock[]) => {
    setBlocks((current) => {
      const anchorId = activeBlockId ?? current[current.length - 1]?.id;
      const index = current.findIndex((block) => block.id === anchorId);
      if (index < 0) return [...current, ...newBlocks];
      return [...current.slice(0, index + 1), ...newBlocks, ...current.slice(index + 1)];
    });
    const focusCandidate = [...newBlocks].reverse().find(isTextBlock);
    setActiveBlockId(focusCandidate?.id ?? newBlocks[newBlocks.length - 1]?.id ?? null);
  };

  const addTextBlock = (type: EditorTextBlock["type"]) => insertBlocksAfterActive([createTextBlock(type)]);
  const addDivider = () => insertBlocksAfterActive([createDividerBlock(), createTextBlock()]);

  const materializeMediaFiles = async (files: File[]) => {
    const remainingSlots = Math.max(0, MAX_ATTACHMENTS - mediaCount);
    if (remainingSlots === 0) {
      setError(`Chỉ được đính kèm tối đa ${MAX_ATTACHMENTS} tệp.`);
      return;
    }

    const picked = files.slice(0, remainingSlots);
    const newBlocks: EditorBlock[] = [];

    for (const rawFile of picked) {
      const isVideo = rawFile.type.startsWith("video/");
      try {
        if (isVideo) {
          if (!ALLOWED_VIDEO_TYPES.has(rawFile.type) && rawFile.type !== "") throw new Error(`Video ${rawFile.name} chưa được hỗ trợ`);
          if (rawFile.size > MAX_VIDEO_SIZE) throw new Error(`Video ${rawFile.name} vượt quá 50MB`);
          const previewUrl = URL.createObjectURL(rawFile);
          previewUrlsRef.current.add(previewUrl);
          newBlocks.push({ id: createBlockId(), type: "video", caption: "", media: { kind: "local", file: rawFile, previewUrl, type: "VIDEO" } });
          continue;
        }

        const { mainFile, thumbnailFile } = await processImageFile(rawFile);
        const previewUrl = URL.createObjectURL(mainFile);
        previewUrlsRef.current.add(previewUrl);
        newBlocks.push({ id: createBlockId(), type: "image", caption: "", media: { kind: "local", file: mainFile, thumbnailFile, previewUrl, type: "IMAGE" } });
      } catch (processingError) {
        setError(processingError instanceof Error ? processingError.message : "Không thể xử lý tệp");
      }
    }

    if (newBlocks.length > 0) insertBlocksAfterActive([...newBlocks, createTextBlock()]);
  };

  const onPickFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setError(null);
    await materializeMediaFiles(Array.from(files));
    event.target.value = "";
  };

  const onPaste = async (event: ClipboardEvent<HTMLDivElement>) => {
    const clipboardItems = event.clipboardData?.items ? Array.from(event.clipboardData.items) : [];
    const imageItems = clipboardItems.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    event.preventDefault();
    setError(null);
    const files = imageItems.map((item, index) => item.getAsFile() ?? new File([], `clipboard-${Date.now()}-${index}.png`, { type: item.type })).filter((file): file is File => file.size > 0);
    await materializeMediaFiles(files);
  };

  const uploadMediaBlocks = async (items: EditorMediaBlock[]) => {
    const localItems = items.filter((item): item is EditorMediaBlock & { media: LocalMedia } => item.media.kind === "local");
    const uploadedByBlockId = new Map<string, UploadedMedia>();
    if (localItems.length === 0) return uploadedByBlockId;

    const signature = await apiRequest<{ cloudName: string; apiKey: string; folder: string; timestamp: number; signature: string }>("/media/signature", props.token);
    const totalSteps = localItems.reduce((sum, item) => sum + (item.media.type === "IMAGE" ? 2 : 1), 0);
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

    for (const item of localItems) {
      if (item.media.type === "VIDEO") {
        const videoUpload = await uploadSingleFile(item.media.file, "video");
        uploadedByBlockId.set(item.id, { type: "VIDEO", url: videoUpload.secure_url, publicId: videoUpload.public_id, sizeBytes: item.media.file.size });
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Tiêu đề không được để trống.");
      return;
    }
    if (!hasBody) {
      setError("Bài viết cần có nội dung hoặc ảnh minh họa.");
      return;
    }

    setBusy(true);
    setUploadProgress(0);
    setError(null);

    try {
      const cleanedBlocks = blocks.filter((block, index, array) => {
        if (block.type === "divider") return Boolean(array[index - 1] || array[index + 1]);
        if (isTextBlock(block)) return block.text.trim().length > 0;
        return true;
      });

      const mediaBlocks = cleanedBlocks.filter((block): block is EditorMediaBlock => block.type === "image" || block.type === "video");
      const uploadedByBlockId = await uploadMediaBlocks(mediaBlocks);
      const content = getPlainContent(cleanedBlocks) || title.trim();

      const serializedBlocks = cleanedBlocks.map((block) => {
        if (block.type === "divider") return { id: block.id, type: "divider" as const };
        if (isTextBlock(block)) return { id: block.id, type: block.type, text: block.text.trim() };

        const uploaded = uploadedByBlockId.get(block.id);
        if (uploaded) {
          if (uploaded.type === "VIDEO") return { id: block.id, type: "video" as const, url: uploaded.url, publicId: uploaded.publicId, caption: block.caption.trim() || undefined };
          return { id: block.id, type: "image" as const, url: uploaded.url, thumbnailUrl: uploaded.thumbnailUrl, publicId: uploaded.publicId, thumbnailPublicId: uploaded.thumbnailPublicId, caption: block.caption.trim() || undefined };
        }
        if (block.media.kind !== "remote") throw new Error("Không thể tải tệp lên.");
        if (block.type === "video") return { id: block.id, type: "video" as const, url: block.media.url, publicId: block.media.publicId, caption: block.caption.trim() || undefined };
        return { id: block.id, type: "image" as const, url: block.media.url, thumbnailUrl: block.media.thumbnailUrl ?? undefined, publicId: block.media.publicId, thumbnailPublicId: block.media.thumbnailPublicId ?? undefined, caption: block.caption.trim() || undefined };
      });

      const media = serializedBlocks.flatMap((block, sortOrder) => {
        if (block.type !== "image" && block.type !== "video") return [];
        return [{
          type: block.type === "image" ? ("IMAGE" as const) : ("VIDEO" as const),
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

      const payload = { title: title.trim(), content, blocks: serializedBlocks, media };

      if (props.mode === "create") {
        if (props.impersonateTarget) {
          await apiRequest(`/admin/posts/as-user/${props.impersonateTarget.employeeId}`, props.token, "POST", payload);
        } else {
          await apiRequest("/posts", props.token, "POST", payload);
        }
      } else if (props.post) {
        await apiRequest(`/posts/${props.post.id}`, props.token, "PATCH", payload);
      }

      props.onSaved();
      props.onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không thể lưu bài viết");
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  };

  const renderTextBlock = (block: EditorTextBlock) => (
    <div key={block.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="theme-primary-soft inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
            {blockTypeLabel(block.type)}
          </span>
          <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1">
            {([
              ["paragraph", <Type key="type" size={15} />, "Văn bản"],
              ["heading", <Heading2 key="heading" size={15} />, "Tiêu đề phụ"],
              ["quote", <Quote key="quote" size={15} />, "Trích dẫn"]
            ] as const).map(([type, icon, label]) => (
              <button
                key={type}
                type="button"
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
                  block.type === type ? "theme-primary-bg text-[color:var(--primary-text)]" : "text-slate-500 hover:bg-white hover:text-slate-700"
                }`}
                onClick={() => updateTextBlock(block.id, { type })}
                title={label}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {blocks.length > 1 ? (
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={() => removeBlock(block.id)}
            aria-label="Xóa block"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      <textarea
        ref={(node) => {
          textRefs.current[block.id] = node;
        }}
        data-variant={block.type}
        rows={block.type === "heading" ? 2 : 6}
        className={`w-full resize-none overflow-hidden rounded-2xl border border-transparent bg-transparent outline-none placeholder:text-slate-400 ${
          block.type === "heading"
            ? "text-[24px] font-bold leading-tight tracking-tight text-slate-900"
            : block.type === "quote"
              ? "text-[16px] italic leading-7 text-slate-700"
              : "min-h-[240px] text-[16px] leading-7 text-slate-700"
        }`}
        placeholder={textPlaceholder(block.type)}
        value={block.text}
        onFocus={() => setActiveBlockId(block.id)}
        onChange={(event) => {
          updateTextBlock(block.id, { text: event.target.value });
          resizeTextarea(event.target, block.type === "heading" ? 72 : 240);
        }}
        onInput={(event) => resizeTextarea(event.currentTarget, block.type === "heading" ? 72 : 240)}
      />
    </div>
  );

  const renderDividerBlock = (block: EditorDividerBlock) => (
    <div key={block.id} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          <Minus size={14} />
          Đường phân cách
        </span>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-slate-700"
          onClick={() => removeBlock(block.id)}
          aria-label="Xóa đường phân cách"
        >
          <X size={16} />
        </button>
      </div>
      <hr className="border-slate-300" />
    </div>
  );

  const renderMediaBlock = (block: EditorMediaBlock) => {
    const previewUrl = block.media.kind === "local" ? block.media.previewUrl : block.media.url;
    const isImage = block.type === "image";
    return (
      <figure key={block.id} className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {isImage ? <ImageIcon size={14} /> : <Video size={14} />}
            {isImage ? "Ảnh minh họa" : "Video"}
          </span>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={() => removeBlock(block.id)}
            aria-label="Xóa tệp"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-slate-100">
          {isImage ? <img src={previewUrl} alt="Ảnh minh họa" className="max-h-[520px] w-full object-contain" draggable={false} /> : <video src={previewUrl} className="max-h-[520px] w-full object-contain" controls />}
        </div>
        <input
          className="theme-primary-focus mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:bg-white"
          placeholder="Thêm chú thích ảnh..."
          value={block.caption}
          onFocus={() => setActiveBlockId(block.id)}
          onChange={(event) => updateMediaCaption(block.id, event.target.value)}
        />
      </figure>
    );
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/30 p-4 backdrop-blur-sm" onClick={props.onClose}>
      <form
        className="mx-auto flex max-h-[90vh] w-full max-w-[960px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-[#fcfbf8] text-slate-900 shadow-[0_35px_90px_-45px_rgba(15,23,42,0.34)]"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-[#fcfbf8]/95 px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-2xl font-bold tracking-tight text-slate-900">{modeLabel}</div>
              {props.mode === "create" ? (
                <div className="mt-1 text-sm text-slate-500">
                  {props.impersonateTarget ? `${props.impersonateTarget.fullName} · MSNV ${props.impersonateTarget.msnv}` : props.authorLabel}
                </div>
              ) : (
                <div className="mt-1 text-sm text-slate-500">Trình bày nội dung theo dạng bản tin nội bộ.</div>
              )}
            </div>
            <button
              type="button"
              className="icon-btn theme-primary-border-hover h-10 w-10 rounded-full border border-slate-200 bg-white hover:bg-[color:var(--primary-faint)] hover:text-[color:var(--primary)]"
              onClick={props.onClose}
              aria-label="Đóng"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {props.mode === "edit" && props.loading ? (
          <div className="flex flex-1 items-center justify-center px-6 py-20 text-slate-500">
            <LoaderCircle size={18} className="mr-2 animate-spin" />
            Đang tải dữ liệu bài viết...
          </div>
        ) : props.mode === "edit" && props.loadError ? (
          <div className="flex flex-1 items-center justify-center px-6 py-20">
            <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-600">{props.loadError}</div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6" onPaste={onPaste}>
              <div className="mx-auto max-w-[820px]">
                <input
                  className="w-full bg-transparent text-[34px] font-bold tracking-tight text-slate-900 outline-none placeholder:text-slate-400 sm:text-[40px]"
                  placeholder="Tiêu đề bản tin"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />

                <div className="mt-5 space-y-4">
                  {blocks.map((block) => {
                    if (block.type === "divider") return renderDividerBlock(block);
                    if (isTextBlock(block)) return renderTextBlock(block);
                    return renderMediaBlock(block);
                  })}
                </div>

                <div className="sticky bottom-0 mt-5 rounded-[24px] border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="theme-primary-border-hover inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600 transition hover:bg-[color:var(--primary-faint)] hover:text-[color:var(--primary)]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon size={18} />
                      + Ảnh
                    </button>
                    <button
                      type="button"
                      className="theme-primary-border-hover inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600 transition hover:bg-[color:var(--primary-faint)] hover:text-[color:var(--primary)]"
                      onClick={() => addTextBlock("heading")}
                    >
                      <Heading2 size={18} />
                      + Tiêu đề phụ
                    </button>
                    <button
                      type="button"
                      className="theme-primary-border-hover inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600 transition hover:bg-[color:var(--primary-faint)] hover:text-[color:var(--primary)]"
                      onClick={() => addTextBlock("quote")}
                    >
                      <Quote size={18} />
                      + Quote
                    </button>
                    <button
                      type="button"
                      className="theme-primary-border-hover inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600 transition hover:bg-[color:var(--primary-faint)] hover:text-[color:var(--primary)]"
                      onClick={addDivider}
                    >
                      <Minus size={18} />
                      + Đường phân cách
                    </button>
                    <button
                      type="button"
                      className="theme-primary-border-hover inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600 transition hover:bg-[color:var(--primary-faint)] hover:text-[color:var(--primary)]"
                      onClick={() => addTextBlock("paragraph")}
                    >
                      <Pilcrow size={18} />
                      + Đoạn văn
                    </button>
                    {/* <button
                      type="button"
                      className="theme-primary-border-hover inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600 transition hover:bg-[color:var(--primary-faint)] hover:text-[color:var(--primary)]"
                      onClick={() => window.alert("Tính năng đính kèm tài liệu đang được bảo trì.")}
                    >
                      <FileText size={18} />
                      + Tài liệu
                    </button> */}
                    <input
                      ref={fileInputRef}
                      name="media"
                      className="hidden"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v"
                      onChange={onPickFiles}
                    />
                  </div>
                </div>

                {busy && uploadProgress > 0 ? (
                  <div className="mt-5">
                    <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                      <LoaderCircle size={16} className="animate-spin" />
                      Đang tải tệp lên... {uploadProgress}%
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="theme-primary-bg h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <div className="mt-5 flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                    <CircleAlert size={16} />
                    {error}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="sticky bottom-0 border-t border-slate-200 bg-[#fcfbf8]/95 px-5 py-4 backdrop-blur sm:px-6">
              <div className="mx-auto flex max-w-[820px] items-center justify-between gap-3">
                <div className="text-sm text-slate-500">Có thể dán ảnh bằng Ctrl+V ngay trong editor.</div>
                <div className="flex items-center gap-3">
                  <button type="button" className="rounded-2xl border border-slate-200 px-5 py-2.5 text-slate-600 transition hover:bg-slate-50" onClick={props.onClose}>
                    Hủy
                  </button>
                  <button type="submit" disabled={busy || !title.trim() || !hasBody} className="btn-primary px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-45">
                    {busy ? "Đang lưu..." : actionLabel}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
