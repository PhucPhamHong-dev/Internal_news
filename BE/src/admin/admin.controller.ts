import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RoleEnum } from "../common/enums";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CreatePostDto } from "../posts/dto/create-post.dto";
import { AdminService } from "./admin.service";
import { BroadcastDto } from "./dto/broadcast.dto";
import { CreateManagedUserDto } from "./dto/create-managed-user.dto";
import { ResetManagedPasswordDto } from "./dto/reset-managed-password.dto";
import { UpdateManagedUserDto } from "./dto/update-managed-user.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN, RoleEnum.HR_MANAGER)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post("notifications/broadcast")
  @Roles(RoleEnum.ADMIN)
  broadcast(@Body() body: BroadcastDto) {
    return this.adminService.broadcast(body.message.trim());
  }

  @Get("comments/:commentId/identity")
  @Roles(RoleEnum.ADMIN)
  identity(@Param("commentId") commentId: string) {
    return this.adminService.getCommentIdentity(commentId);
  }

  @Get("users")
  listUsers(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
    @Query("filter") filter?: "ALL" | "ACTIVE" | "INACTIVE" | "DISABLED"
  ) {
    return this.adminService.listUsers({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      filter
    });
  }

  @Post("users")
  createUser(@CurrentUser() user: AuthUser, @Body() body: CreateManagedUserDto) {
    return this.adminService.createUser(user, {
      msnv: body.msnv.trim().toUpperCase(),
      fullName: body.fullName.trim(),
      initialPassword: body.initialPassword?.trim(),
      canPost: body.canPost,
      canManageEmployees: body.canManageEmployees
    });
  }

  @Patch("users/:employeeId")
  updateUser(@CurrentUser() user: AuthUser, @Param("employeeId") employeeId: string, @Body() body: UpdateManagedUserDto) {
    return this.adminService.updateUser(user, employeeId, {
      fullName: body.fullName?.trim(),
      isActive: body.isActive,
      canPost: body.canPost,
      canManageEmployees: body.canManageEmployees,
      loginEmail: body.loginEmail == null ? body.loginEmail : body.loginEmail.trim().toLowerCase()
    });
  }

  @Post("users/:employeeId/unlink-gmail")
  @Roles(RoleEnum.ADMIN)
  unlinkGmail(@Param("employeeId") employeeId: string) {
    return this.adminService.unlinkGmail(employeeId);
  }

  @Post("users/:employeeId/reset-password")
  resetPassword(@Param("employeeId") employeeId: string, @Body() body: ResetManagedPasswordDto) {
    return this.adminService.resetPassword(employeeId, body.newPassword?.trim());
  }

  @Post("posts/as-user/:employeeId")
  @Roles(RoleEnum.ADMIN)
  composeAsUser(@Param("employeeId") employeeId: string, @Body() body: CreatePostDto) {
    return this.adminService.composeAsUser(employeeId, body);
  }
}
