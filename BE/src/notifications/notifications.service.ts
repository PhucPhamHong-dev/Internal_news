import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { recipientId: userId },
      include: {
        reads: {
          where: { userId },
          select: { id: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return notifications.map((n: any) => ({
      id: n.id,
      message: n.message,
      type: n.type,
      metadata: n.metadata,
      createdAt: n.createdAt.toISOString(),
      isRead: n.reads.length > 0
    }));
  }

  async markRead(userId: string, notificationId: string) {
    await this.prisma.notificationRead.upsert({
      where: {
        notificationId_userId: { notificationId, userId }
      },
      update: {},
      create: {
        notificationId,
        userId
      }
    });
    return { ok: true };
  }

  async unreadCount(userId: string) {
    const total = await this.prisma.notification.count({ where: { recipientId: userId } });
    const read = await this.prisma.notificationRead.count({ where: { userId } });
    return Math.max(0, total - read);
  }
}
