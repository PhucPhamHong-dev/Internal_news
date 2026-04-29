export enum Role {
  ADMIN = "ADMIN",
  HR_MANAGER = "HR_MANAGER",
  WRITER = "WRITER",
  VIEWER = "VIEWER"
}

export type UserProfile = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: Role;
  canPost: boolean;
  canManageEmployees: boolean;
  linkedMsnv: string | null;
  linked: boolean;
};

export type MediaType = "IMAGE" | "VIDEO";

export type FeedPost = {
  id: string;
  title: string;
  content: string;
  authorName: string;
  authorAvatar: string | null;
  authorRole: Role;
  pinPriority: number | null;
  isPinned: boolean;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  likedByMe: boolean;
  media: Array<{
    id: string;
    type: MediaType;
    url: string;
    publicId: string;
  }>;
};

export type NotificationItem = {
  id: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};
