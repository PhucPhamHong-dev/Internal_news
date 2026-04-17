export enum RoleEnum {
  ADMIN = "ADMIN",
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

export type RoleValue = `${RoleEnum}`;
