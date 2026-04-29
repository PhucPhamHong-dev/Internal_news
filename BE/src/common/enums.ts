export enum RoleEnum {
  ADMIN = "ADMIN",
  HR_MANAGER = "HR_MANAGER",
  WRITER = "WRITER",
  VIEWER = "VIEWER"
}

export enum MediaTypeEnum {
  IMAGE = "IMAGE",
  VIDEO = "VIDEO"
}

export enum NotificationTypeEnum {
  ADMIN_BROADCAST = "ADMIN_BROADCAST",
  POST_LIKED = "POST_LIKED",
  POST_COMMENTED = "POST_COMMENTED",
  COMMENT_REPLIED = "COMMENT_REPLIED"
}

export enum ReactionTypeEnum {
  LIKE = "LIKE",
  LOVE = "LOVE",
  CARE = "CARE",
  HAHA = "HAHA",
  WOW = "WOW",
  SAD = "SAD",
  ANGRY = "ANGRY"
}

export type RoleValue = `${RoleEnum}`;
