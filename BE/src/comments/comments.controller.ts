import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { CommentsService } from "./comments.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post("posts/:id/comments")
  createComment(@Param("id") postId: string, @CurrentUser() user: AuthUser, @Body() body: CreateCommentDto) {
    return this.commentsService.createComment(postId, user, body.content);
  }

  @Post("comments/:id/replies")
  createReply(@Param("id") commentId: string, @CurrentUser() user: AuthUser, @Body() body: CreateCommentDto) {
    return this.commentsService.createReply(commentId, user, body.content);
  }

  @Get("posts/:id/comments")
  getComments(
    @Param("id") postId: string,
    @CurrentUser() user: AuthUser,
    @Query("mode") mode: "top" | "all" = "top",
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string
  ) {
    return this.commentsService.getComments(postId, user.sub, {
      mode: mode === "all" ? "all" : "top",
      limit: limit ? Number(limit) : undefined,
      cursor: cursor || undefined
    });
  }

  @Get("comments/:id/replies")
  getReplies(@Param("id") commentId: string, @CurrentUser() user: AuthUser, @Query("limit") limit?: string, @Query("cursor") cursor?: string) {
    return this.commentsService.getReplies(commentId, user.sub, {
      limit: limit ? Number(limit) : undefined,
      cursor: cursor || undefined
    });
  }

  @Post("comments/:id/like")
  likeComment(@Param("id") commentId: string, @CurrentUser() user: AuthUser) {
    return this.commentsService.likeComment(commentId, user.sub);
  }

  @Post("comments/:id/unlike")
  unlikeComment(@Param("id") commentId: string, @CurrentUser() user: AuthUser) {
    return this.commentsService.unlikeComment(commentId, user.sub);
  }
}
