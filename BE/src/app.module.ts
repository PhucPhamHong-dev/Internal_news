import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AdminController } from "./admin/admin.controller";
import { AdminService } from "./admin/admin.service";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { JwtStrategy } from "./auth/jwt.strategy";
import { RedisService } from "./cache/redis.service";
import { CommentsController } from "./comments/comments.controller";
import { CommentsService } from "./comments/comments.service";
import { NotificationsController } from "./notifications/notifications.controller";
import { NotificationsGateway } from "./notifications/notifications.gateway";
import { NotificationsService } from "./notifications/notifications.service";
import { PostsController } from "./posts/posts.controller";
import { PostsService } from "./posts/posts.service";
import { PrismaService } from "./prisma/prisma.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET", "replace_me"),
        signOptions: { expiresIn: "7d" }
      })
    })
  ],
  controllers: [AuthController, PostsController, CommentsController, NotificationsController, AdminController],
  providers: [
    PrismaService,
    AuthService,
    JwtStrategy,
    PostsService,
    CommentsService,
    NotificationsService,
    NotificationsGateway,
    AdminService,
    RedisService
  ]
})
export class AppModule {}
