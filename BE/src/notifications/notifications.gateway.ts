import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Server } from "socket.io";
import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from "@nestjs/websockets";

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.API_CORS_ORIGIN || "http://localhost:3000",
    credentials: true
  }
})
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly _config: ConfigService
  ) {}

  handleConnection(client: { id: string; handshake: { auth?: { token?: string } }; join: (room: string) => void }) {
    const token = client.handshake.auth?.token;
    if (!token) {
      return;
    }
    try {
      const payload = this.jwt.verify<{ sub: string }>(token);
      client.join(`user:${payload.sub}`);
    } catch {
      return;
    }
  }

  pushToUser(userId: string, notification: { id: string; message: string; createdAt: Date }) {
    this.server.to(`user:${userId}`).emit("notification:new", {
      id: notification.id,
      message: notification.message,
      createdAt: notification.createdAt
    });
    this.server.to(`user:${userId}`).emit("notification:badge_count");
  }
}
