import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from "@nestjs/common";
import { ClassSerializerInterceptor } from "@nestjs/common/serializer";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator";
import { RoleEnum } from "../common/enums";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreatePostDto } from "./dto/create-post.dto";
import { UpdatePostDto } from "./dto/update-post.dto";
import { PostsService } from "./posts.service";

@Controller()
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post("posts")
  @Roles(RoleEnum.ADMIN, RoleEnum.WRITER)
  createPost(@CurrentUser() user: AuthUser, @Body() body: CreatePostDto) {
    return this.postsService.createPost(user, body);
  }

  @Get("posts")
  getFeed(
    @CurrentUser() user: AuthUser,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
    @Query("excludeId") excludeId?: string
  ) {
    return this.postsService.getFeed(user.sub, {
      limit: limit ? Number(limit) : undefined,
      cursor: cursor || undefined,
      excludeId: excludeId || undefined
    });
  }

  @Get("posts/:id")
  getPost(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.postsService.getPostById(user.sub, id);
  }

  @Get("posts/:id/related")
  getRelatedPosts(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("limit") limit?: string) {
    return this.postsService.getRelatedPosts(user.sub, id, limit ? Number(limit) : undefined);
  }

  @Patch("posts/:id")
  @Roles(RoleEnum.ADMIN, RoleEnum.WRITER)
  updatePost(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: UpdatePostDto) {
    return this.postsService.updatePost(user, id, body);
  }

  @Delete("posts/:id")
  @Roles(RoleEnum.ADMIN, RoleEnum.WRITER)
  deletePost(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.postsService.deletePost(user, id);
  }

  @Post("posts/:id/pin")
  @Roles(RoleEnum.ADMIN, RoleEnum.WRITER)
  pinPost(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.postsService.pinPost(user, id);
  }

  @Delete("posts/:id/pin")
  @Roles(RoleEnum.ADMIN, RoleEnum.WRITER)
  unpinPost(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.postsService.unpinPost(user, id);
  }

  @Post("posts/:id/view")
  viewPost(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.postsService.viewPost(user.sub, id);
  }

  @Post("posts/:id/like")
  likePost(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.postsService.likePost(user, id);
  }

  @Delete("posts/:id/like")
  unlikePost(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.postsService.unlikePost(user.sub, id);
  }

  @Get("search")
  search(@CurrentUser() user: AuthUser, @Query("q") q: string = "") {
    return this.postsService.search(user.sub, q);
  }

  @Get("media/signature")
  @Roles(RoleEnum.ADMIN, RoleEnum.WRITER)
  createSignature() {
    return this.postsService.createUploadSignature();
  }
}
